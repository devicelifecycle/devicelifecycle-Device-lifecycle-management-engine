// ============================================================================
// ORDER CSV UPLOAD API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { sanitizeCsvCell } from '@/lib/utils'
import { DEVICE_CONDITION_VALUES } from '@/lib/validations'

interface CSVRow {
  brand: string
  model: string
  storage: string
  condition: string
  quantity: number
  imei?: string
  serial_number?: string
  notes?: string
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Role-based authorization: only sales, coe_manager, admin can upload CSVs
    const { data: userProfile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!userProfile || !['admin', 'coe_manager', 'sales'].includes(userProfile.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const body = await request.json()
    const { rows, customer_id } = body as { rows: CSVRow[]; customer_id: string }

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: 'No data rows provided' },
        { status: 400 }
      )
    }

    // Security: Limit row count to prevent DOS
    if (rows.length > 1000) {
      return NextResponse.json(
        { error: 'Too many rows. Maximum 1,000 rows per upload.' },
        { status: 400 }
      )
    }

    if (!customer_id) {
      return NextResponse.json(
        { error: 'customer_id is required' },
        { status: 400 }
      )
    }

    // Verify customer_id is a valid UUID and exists (prevents IDOR)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(customer_id)) {
      return NextResponse.json({ error: 'Invalid customer_id format' }, { status: 400 })
    }
    const { data: customerExists } = await supabase
      .from('customers')
      .select('id')
      .eq('id', customer_id)
      .single()
    if (!customerExists) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    // Sanitize and validate rows
    const errors: { row: number; message: string }[] = []
    const sanitizedRows = rows.map((row, index) => {
      const brand = sanitizeCsvCell(row.brand)
      const model = sanitizeCsvCell(row.model)
      const storage = sanitizeCsvCell(row.storage)
      const condition = sanitizeCsvCell(row.condition)
      const quantity = Number(row.quantity)

      const condLower = condition.toLowerCase().trim()
      const validCondition = DEVICE_CONDITION_VALUES.includes(condLower as (typeof DEVICE_CONDITION_VALUES)[number])

      if (!brand) errors.push({ row: index + 1, message: 'Brand is required' })
      if (!model) errors.push({ row: index + 1, message: 'Model is required' })
      if (!storage) errors.push({ row: index + 1, message: 'Storage is required' })
      if (!condition) errors.push({ row: index + 1, message: 'Condition is required' })
      if (!validCondition) errors.push({ row: index + 1, message: `Condition must be one of: ${DEVICE_CONDITION_VALUES.join(', ')}` })
      if (!quantity || quantity < 1 || quantity > 10000) errors.push({ row: index + 1, message: 'Quantity must be between 1 and 10,000' })

      return { ...row, brand, model, storage, condition: validCondition ? condLower : condition, quantity }
    })

    if (errors.length > 0) {
      return NextResponse.json(
        { error: 'Validation errors', details: errors },
        { status: 400 }
      )
    }

    // Generate order number using DB function to avoid collisions
    const { data: orderNumResult } = await supabase.rpc('generate_order_number')
    const orderNumber = orderNumResult || `TI-${Date.now()}`

    // Calculate totals using sanitized rows
    const totalQuantity = sanitizedRows.reduce((sum, row) => sum + row.quantity, 0)

    // Create order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        type: 'trade_in',
        status: 'draft',
        customer_id,
        created_by_id: user.id,
        total_quantity: totalQuantity,
        total_amount: 0,
      })
      .select()
      .single()

    if (orderError) throw orderError

    // Look up devices and create order items from sanitized rows
    const orderItems = []
    for (const row of sanitizedRows) {
      // Try to find matching device
      const { data: device } = await supabase
        .from('device_catalog')
        .select('id')
        .ilike('make', row.brand)
        .ilike('model', row.model)
        .limit(1)
        .single()

      orderItems.push({
        order_id: order.id,
        device_id: device?.id || null,
        quantity: row.quantity,
        storage: row.storage,
        claimed_condition: row.condition,
        notes: row.notes || null,
      })
    }

    if (orderItems.length > 0) {
      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems)

      if (itemsError) {
        console.error('Error creating order items:', itemsError)
      }
    }

    return NextResponse.json({
      order,
      items_created: orderItems.length,
      total_quantity: totalQuantity,
    }, { status: 201 })
  } catch (error) {
    console.error('Error uploading CSV:', error)
    return NextResponse.json(
      { error: 'Failed to process CSV upload' },
      { status: 500 }
    )
  }
}
