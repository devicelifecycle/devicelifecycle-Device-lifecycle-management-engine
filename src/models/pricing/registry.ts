// ============================================================================
// PRICING MODEL REGISTRY
// ============================================================================
// Register and resolve pricing models by ID.
// Devices/orders can specify which model to use.

import type { IPricingModel } from './types'
import { SimpleMarginPricingModel } from './simple-margin.model'
import { CompetitorBeatPricingModel } from './competitor-beat.model'
import { DataDrivenPricingModel } from './data-driven.model'

const models = new Map<string, IPricingModel>()

function register(model: IPricingModel): void {
  models.set(model.id, model)
}

// Register built-in models
register(new SimpleMarginPricingModel())
register(new CompetitorBeatPricingModel())
register(new DataDrivenPricingModel())

export const PricingModelRegistry = {
  /** Get model by ID */
  get(id: string): IPricingModel | undefined {
    return models.get(id)
  },

  /** List all registered models */
  list(): IPricingModel[] {
    return Array.from(models.values())
  },

  /** Register a custom model */
  register(model: IPricingModel): void {
    models.set(model.id, model)
  },

  /** Default model when none specified */
  default(): IPricingModel {
    return models.get('data_driven') ?? models.get('simple_margin') ?? new SimpleMarginPricingModel()
  },
}
