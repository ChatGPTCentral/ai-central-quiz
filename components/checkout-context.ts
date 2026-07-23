'use client'

// Shared checkout-mode context. Kept deliberately tiny and Stripe-free so the
// CTAs (CheckoutLink, OfferBar) can read the mode without pulling @stripe/stripe-js
// into their bundles. The provider lives in components/result2/CheckoutModal.client.tsx.
//
// Default = 'link' with a no-op open(), so any CTA rendered WITHOUT a provider
// (v1 pages, anywhere else) behaves exactly as before: it just navigates to its
// href. Only inside CheckoutModalProvider(mode='embedded') does open() do anything.

import { createContext, useContext } from 'react'

export type CheckoutMode = 'link' | 'embedded'

export interface CheckoutCtxValue {
  mode: CheckoutMode
  /** Open the on-page checkout modal. No-op in 'link' mode. */
  open: () => void
}

export const CheckoutCtx = createContext<CheckoutCtxValue>({ mode: 'link', open: () => {} })

export function useCheckout(): CheckoutCtxValue {
  return useContext(CheckoutCtx)
}
