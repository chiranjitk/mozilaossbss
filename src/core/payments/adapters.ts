// =====================================================================
// PAYMENT GATEWAY ADAPTER INTERFACE
// Each gateway (Stripe, Razorpay, PayPal, Manual) implements this.
// New gateways can be added without changing the payment service.
// =====================================================================

export interface PaymentRequest {
  amount: number; // in major currency units
  currency: string;
  invoiceNumber?: string;
  subscriberId?: string;
  description?: string;
  returnUrl?: string;
  webhookUrl?: string;
}

export interface PaymentResult {
  success: boolean;
  gatewayRef?: string;
  gatewayMessage?: string;
  redirectUrl?: string;
  status: "pending" | "completed" | "failed";
}

export interface GatewayAdapter {
  readonly name: string;
  readonly displayName: string;
  readonly supportedMethods: string[];
  readonly requiresConfig: string[]; // e.g. ["apiKey", "secretKey"]

  /**
   * Create a payment intent / charge via the gateway.
   * In production, this would call the gateway's API.
   * In sandbox/test mode, returns a simulated response.
   */
  createPayment(request: PaymentRequest, config: Record<string, string>): Promise<PaymentResult>;

  /**
   * Verify a webhook signature from the gateway.
   */
  verifyWebhook(payload: string, signature: string, config: Record<string, string>): boolean;

  /**
   * Refund a payment via the gateway.
   */
  refund(gatewayRef: string, amount: number, config: Record<string, string>): Promise<PaymentResult>;

  /**
   * Check if the gateway is properly configured.
   */
  isConfigured(config: Record<string, string>): boolean;
}

// =====================================================================
// MANUAL ADAPTER — for cash/bank transfer/check payments
// No external API calls; just records the payment.
// =====================================================================

class ManualAdapter implements GatewayAdapter {
  readonly name = "manual";
  readonly displayName = "Manual / Cash";
  readonly supportedMethods = ["cash", "bank", "cheque", "other"];
  readonly requiresConfig: string[] = [];

  async createPayment(request: PaymentRequest, _config: Record<string, string>): Promise<PaymentResult> {
    return {
      success: true,
      gatewayRef: `MAN-${Date.now()}`,
      gatewayMessage: "Manual payment recorded",
      status: "completed",
    };
  }

  verifyWebhook(): boolean {
    return true; // No webhooks for manual payments
  }

  async refund(gatewayRef: string, _amount: number): Promise<PaymentResult> {
    return {
      success: true,
      gatewayRef: `REF-${gatewayRef}`,
      gatewayMessage: "Manual refund recorded",
      status: "completed",
    };
  }

  isConfigured(): boolean {
    return true; // Always configured
  }
}

// =====================================================================
// STRIPE ADAPTER (simulated in sandbox)
// In production, this would call the Stripe API.
// =====================================================================

class StripeAdapter implements GatewayAdapter {
  readonly name = "stripe";
  readonly displayName = "Stripe";
  readonly supportedMethods = ["card", "apple_pay", "google_pay"];
  readonly requiresConfig = ["apiKey", "webhookSecret"];

  async createPayment(request: PaymentRequest, config: Record<string, string>): Promise<PaymentResult> {
    if (!this.isConfigured(config)) {
      return { success: false, gatewayMessage: "Stripe not configured (missing apiKey)", status: "failed" };
    }

    // In production: const stripe = require("stripe")(config.apiKey);
    // const intent = await stripe.paymentIntents.create({ amount: Math.round(request.amount * 100), currency: request.currency });
    // For sandbox: simulate
    return {
      success: true,
      gatewayRef: `pi_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      gatewayMessage: "PaymentIntent created (sandbox)",
      redirectUrl: `https://checkout.stripe.com/pay/test_${Date.now()}`,
      status: "pending",
    };
  }

  verifyWebhook(payload: string, signature: string, config: Record<string, string>): boolean {
    // In production: stripe.webhooks.constructEvent(payload, signature, config.webhookSecret)
    return !!config.webhookSecret && !!signature;
  }

  async refund(gatewayRef: string, _amount: number, _config: Record<string, string>): Promise<PaymentResult> {
    return {
      success: true,
      gatewayRef: `re_${gatewayRef}`,
      gatewayMessage: "Refund created (sandbox)",
      status: "completed",
    };
  }

  isConfigured(config: Record<string, string>): boolean {
    return !!(config.apiKey && config.webhookSecret);
  }
}

// =====================================================================
// RAZORPAY ADAPTER (simulated)
// =====================================================================

class RazorpayAdapter implements GatewayAdapter {
  readonly name = "razorpay";
  readonly displayName = "Razorpay";
  readonly supportedMethods = ["card", "upi", "netbanking", "wallet", "emi"];
  readonly requiresConfig = ["keyId", "keySecret"];

  async createPayment(request: PaymentRequest, config: Record<string, string>): Promise<PaymentResult> {
    if (!this.isConfigured(config)) {
      return { success: false, gatewayMessage: "Razorpay not configured (missing keyId/keySecret)", status: "failed" };
    }

    // In production: const Razorpay = require("razorpay");
    // const rzp = new Razorpay({ key_id: config.keyId, key_secret: config.keySecret });
    // const order = await rzp.orders.create({ amount: Math.round(request.amount * 100), currency: request.currency });
    return {
      success: true,
      gatewayRef: `order_${Date.now()}`,
      gatewayMessage: "Order created (sandbox)",
      redirectUrl: `https://api.razorpay.com/v1/checkout/embedded/test_${Date.now()}`,
      status: "pending",
    };
  }

  verifyWebhook(payload: string, signature: string, config: Record<string, string>): boolean {
    return !!config.webhookSecret && !!signature;
  }

  async refund(gatewayRef: string, _amount: number, _config: Record<string, string>): Promise<PaymentResult> {
    return {
      success: true,
      gatewayRef: `rfp_${gatewayRef}`,
      gatewayMessage: "Refund created (sandbox)",
      status: "completed",
    };
  }

  isConfigured(config: Record<string, string>): boolean {
    return !!(config.keyId && config.keySecret);
  }
}

// =====================================================================
// PAYPAL ADAPTER (simulated)
// =====================================================================

class PayPalAdapter implements GatewayAdapter {
  readonly name = "paypal";
  readonly displayName = "PayPal";
  readonly supportedMethods = ["paypal", "card"];
  readonly requiresConfig = ["clientId", "clientSecret"];

  async createPayment(request: PaymentRequest, config: Record<string, string>): Promise<PaymentResult> {
    if (!this.isConfigured(config)) {
      return { success: false, gatewayMessage: "PayPal not configured", status: "failed" };
    }

    return {
      success: true,
      gatewayRef: `PAYID-${Date.now()}`,
      gatewayMessage: "PayPal order created (sandbox)",
      redirectUrl: `https://www.paypal.com/checkoutnow?token=test_${Date.now()}`,
      status: "pending",
    };
  }

  verifyWebhook(payload: string, signature: string, config: Record<string, string>): boolean {
    return !!config.webhookId && !!signature;
  }

  async refund(gatewayRef: string, _amount: number, _config: Record<string, string>): Promise<PaymentResult> {
    return {
      success: true,
      gatewayRef: `ref_${gatewayRef}`,
      gatewayMessage: "Refund created (sandbox)",
      status: "completed",
    };
  }

  isConfigured(config: Record<string, string>): boolean {
    return !!(config.clientId && config.clientSecret);
  }
}

// =====================================================================
// ADAPTER REGISTRY — lookup by name
// =====================================================================

const ADAPTERS: Record<string, GatewayAdapter> = {
  manual: new ManualAdapter(),
  stripe: new StripeAdapter(),
  razorpay: new RazorpayAdapter(),
  paypal: new PayPalAdapter(),
};

export function getAdapter(name: string): GatewayAdapter | null {
  return ADAPTERS[name] ?? null;
}

export function listAdapters(): Array<{
  name: string;
  displayName: string;
  supportedMethods: string[];
  requiresConfig: string[];
}> {
  return Object.values(ADAPTERS).map((a) => ({
    name: a.name,
    displayName: a.displayName,
    supportedMethods: a.supportedMethods,
    requiresConfig: a.requiresConfig,
  }));
}
