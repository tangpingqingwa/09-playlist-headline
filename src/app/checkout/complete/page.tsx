import React from "react";
import ReturnPage from "../../return/page";

export const dynamic = "force-dynamic";

type CheckoutCompleteProps = {
  searchParams?: Promise<{
    intent?: string | string[];
    sessionId?: string | string[];
    checkoutId?: string | string[];
    status?: string | string[];
  }>;
};

/** Waffo success URL. Rendering this page never settles or mutates payment state. */
export default function CheckoutCompletePage({ searchParams }: CheckoutCompleteProps) {
  return <ReturnPage searchParams={searchParams} />;
}
