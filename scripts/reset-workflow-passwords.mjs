#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js'

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const ACCOUNTS = [
  {
    email: process.env.CUSTOMER_EMAIL,
    password: process.env.CUSTOMER_PASSWORD,
  },
  {
    email: process.env.VENDOR_EMAIL,
    password: process.env.VENDOR_PASSWORD,
  },
]

if (!URL || !SERVICE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  process.exit(1)
}

if (ACCOUNTS.some((account) => !account.email || !account.password)) {
  console.error('CUSTOMER_EMAIL, CUSTOMER_PASSWORD, VENDOR_EMAIL, and VENDOR_PASSWORD are required.')
  process.exit(1)
}

const supabase = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function findAuthUserByEmail(email) {
  let page = 1

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error

    const user = data.users.find((entry) => entry.email?.toLowerCase() === email.toLowerCase())
    if (user) return user

    if (data.users.length < 200) break
    page += 1
  }

  return null
}

async function main() {
  for (const account of ACCOUNTS) {
    const user = await findAuthUserByEmail(account.email)
    if (!user) {
      throw new Error(`No auth user found for ${account.email}`)
    }

    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password: account.password,
      email_confirm: true,
    })

    if (error) {
      throw error
    }

    console.log(`Updated password for ${account.email}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
