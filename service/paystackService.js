// services/paystackService.js
const axios = require('axios');
const crypto = require('crypto');

const PAYSTACK_BASE_URL = 'https://api.paystack.co';
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

// Configure axios instance
const paystackAPI = axios.create({
  baseURL: PAYSTACK_BASE_URL,
  headers: {
    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json',
  },
});

/**
 * Initialize a payment transaction
 * @param {Object} paymentData - Payment initialization data
 * @returns {Promise<Object>} Paystack response
 */
const initializePayment = async (paymentData) => {
  try {
    const { email, amount, reference, metadata, callback_url, channels } = paymentData;

    const data = {
      email,
      amount: amount * 100, // Convert to kobo
      reference,
      metadata,
      callback_url,
      channels: channels || ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer'],
    };

    const response = await paystackAPI.post('/transaction/initialize', data);

    if (!response.data.status) {
      throw new Error(response.data.message || 'Payment initialization failed');
    }

    return response.data;
  } catch (error) {
    console.error('Paystack initialization error:', error.response?.data || error.message);
    throw new Error(
      error.response?.data?.message || 
      'Failed to initialize payment. Please try again.'
    );
  }
};

/**
 * Verify a payment transaction
 * @param {string} reference - Transaction reference
 * @returns {Promise<Object>} Paystack verification response
 */
const verifyPayment = async (reference) => {
  try {
    const response = await paystackAPI.get(`/transaction/verify/${reference}`);

    if (!response.data.status) {
      throw new Error(response.data.message || 'Payment verification failed');
    }

    return response.data;
  } catch (error) {
    console.error('Paystack verification error:', error.response?.data || error.message);
    throw new Error(
      error.response?.data?.message || 
      'Failed to verify payment. Please try again.'
    );
  }
};

/**
 * Fetch a transaction
 * @param {string} id - Transaction ID
 * @returns {Promise<Object>} Transaction details
 */
const fetchTransaction = async (id) => {
  try {
    const response = await paystackAPI.get(`/transaction/${id}`);

    if (!response.data.status) {
      throw new Error(response.data.message || 'Failed to fetch transaction');
    }

    return response.data;
  } catch (error) {
    console.error('Fetch transaction error:', error.response?.data || error.message);
    throw new Error(
      error.response?.data?.message || 
      'Failed to fetch transaction details.'
    );
  }
};

/**
 * List transactions
 * @param {Object} options - Query options
 * @returns {Promise<Object>} List of transactions
 */
const listTransactions = async (options = {}) => {
  try {
    const { perPage = 50, page = 1, customer, status, from, to } = options;

    const params = {
      perPage,
      page,
      ...(customer && { customer }),
      ...(status && { status }),
      ...(from && { from }),
      ...(to && { to }),
    };

    const response = await paystackAPI.get('/transaction', { params });

    if (!response.data.status) {
      throw new Error(response.data.message || 'Failed to list transactions');
    }

    return response.data;
  } catch (error) {
    console.error('List transactions error:', error.response?.data || error.message);
    throw new Error(
      error.response?.data?.message || 
      'Failed to list transactions.'
    );
  }
};

/**
 * Charge authorization (for recurring payments)
 * @param {Object} chargeData - Charge data
 * @returns {Promise<Object>} Charge response
 */
const chargeAuthorization = async (chargeData) => {
  try {
    const { email, amount, authorization_code, reference, metadata } = chargeData;

    const data = {
      email,
      amount: amount * 100, // Convert to kobo
      authorization_code,
      reference,
      metadata,
    };

    const response = await paystackAPI.post('/transaction/charge_authorization', data);

    if (!response.data.status) {
      throw new Error(response.data.message || 'Charge authorization failed');
    }

    return response.data;
  } catch (error) {
    console.error('Charge authorization error:', error.response?.data || error.message);
    throw new Error(
      error.response?.data?.message || 
      'Failed to charge authorization.'
    );
  }
};

/**
 * Create a refund
 * @param {string} reference - Transaction reference
 * @param {Object} refundData - Refund details
 * @returns {Promise<Object>} Refund response
 */
const createRefund = async (reference, refundData = {}) => {
  try {
    const { amount, merchant_note, customer_note } = refundData;

    const data = {
      transaction: reference,
      ...(amount && { amount: amount * 100 }), // If partial refund
      ...(merchant_note && { merchant_note }),
      ...(customer_note && { customer_note }),
    };

    const response = await paystackAPI.post('/refund', data);

    if (!response.data.status) {
      throw new Error(response.data.message || 'Refund creation failed');
    }

    return response.data;
  } catch (error) {
    console.error('Create refund error:', error.response?.data || error.message);
    throw new Error(
      error.response?.data?.message || 
      'Failed to create refund.'
    );
  }
};

/**
 * Fetch refund details
 * @param {string} reference - Refund reference
 * @returns {Promise<Object>} Refund details
 */
const fetchRefund = async (reference) => {
  try {
    const response = await paystackAPI.get(`/refund/${reference}`);

    if (!response.data.status) {
      throw new Error(response.data.message || 'Failed to fetch refund');
    }

    return response.data;
  } catch (error) {
    console.error('Fetch refund error:', error.response?.data || error.message);
    throw new Error(
      error.response?.data?.message || 
      'Failed to fetch refund details.'
    );
  }
};

/**
 * Get transaction timeline
 * @param {string} id_or_reference - Transaction ID or reference
 * @returns {Promise<Object>} Transaction timeline
 */
const getTransactionTimeline = async (id_or_reference) => {
  try {
    const response = await paystackAPI.get(`/transaction/timeline/${id_or_reference}`);

    if (!response.data.status) {
      throw new Error(response.data.message || 'Failed to fetch timeline');
    }

    return response.data;
  } catch (error) {
    console.error('Transaction timeline error:', error.response?.data || error.message);
    throw new Error(
      error.response?.data?.message || 
      'Failed to fetch transaction timeline.'
    );
  }
};

/**
 * Export transactions
 * @param {Object} options - Export options
 * @returns {Promise<Object>} Export response
 */
const exportTransactions = async (options = {}) => {
  try {
    const { from, to, settled, payment_page } = options;

    const params = {
      ...(from && { from }),
      ...(to && { to }),
      ...(settled !== undefined && { settled }),
      ...(payment_page && { payment_page }),
    };

    const response = await paystackAPI.get('/transaction/export', { params });

    if (!response.data.status) {
      throw new Error(response.data.message || 'Export failed');
    }

    return response.data;
  } catch (error) {
    console.error('Export transactions error:', error.response?.data || error.message);
    throw new Error(
      error.response?.data?.message || 
      'Failed to export transactions.'
    );
  }
};

/**
 * Get payment totals
 * @returns {Promise<Object>} Payment totals
 */
const getPaymentTotals = async () => {
  try {
    const response = await paystackAPI.get('/transaction/totals');

    if (!response.data.status) {
      throw new Error(response.data.message || 'Failed to fetch totals');
    }

    return response.data;
  } catch (error) {
    console.error('Payment totals error:', error.response?.data || error.message);
    throw new Error(
      error.response?.data?.message || 
      'Failed to fetch payment totals.'
    );
  }
};

/**
 * Validate webhook signature
 * @param {string} signature - X-Paystack-Signature header
 * @param {Object} body - Request body
 * @returns {boolean} Is valid
 */
const validateWebhookSignature = (signature, body) => {
  const hash = crypto
    .createHmac('sha512', PAYSTACK_SECRET_KEY)
    .update(JSON.stringify(body))
    .digest('hex');
  
  return hash === signature;
};

module.exports = {
  initializePayment,
  verifyPayment,
  fetchTransaction,
  listTransactions,
  chargeAuthorization,
  createRefund,
  fetchRefund,
  getTransactionTimeline,
  exportTransactions,
  getPaymentTotals,
  validateWebhookSignature
};