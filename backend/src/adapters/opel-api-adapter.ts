/**
 * Opel API Adapter - Interfaces with Opel CRM APIs
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';
import { retryWithBackoff, shouldRetryNetworkError } from '../utils/retry';
import { circuitBreakerRegistry } from '../utils/circuit-breaker';
import {
  VehicleModel,
  StockAvailability,
  AppointmentRequest,
  AppointmentResponse,
  AppError,
  ErrorCode,
} from '../types';

/**
 * Opel API Adapter class
 */
export class OpelAPIAdapter {
  private client: AxiosInstance;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private circuitBreaker = circuitBreakerRegistry.getOrCreate('opel-api', {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000,
    monitoringPeriod: 120000,
  });

  constructor() {
    this.client = axios.create({
      baseURL: config.opel_api.url,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor for authentication
    this.client.interceptors.request.use(
      async (reqConfig) => {
        // Ensure we have a valid token
        if (!config.opel_api?.use_mock) {
          await this.ensureAuthenticated();
          if (this.accessToken) {
            reqConfig.headers.Authorization = `Bearer ${this.accessToken}`;
          }
        }
        return reqConfig;
      },
      (error) => Promise.reject(error),
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        logger.error('Opel API error', {
          url: error.config?.url,
          status: error.response?.status,
          data: error.response?.data,
        });

        if (error.response?.status === 401) {
          // Token expired, clear it
          this.accessToken = null;
          this.tokenExpiry = 0;
        }

        return Promise.reject(error);
      },
    );
  }

  /**
   * Ensure we have a valid access token
   */
  private async ensureAuthenticated(): Promise<void> {
    // Check if token is still valid (with 5-minute buffer)
    const now = Date.now() / 1000;
    if (this.accessToken && this.tokenExpiry > now + 300) {
      return;
    }

    try {
      logger.info('Authenticating with Opel API...');

      const response = await axios.post(`${config.opel_api.url}/oauth/token`, {
        grant_type: 'client_credentials',
        client_id: config.opel_api.api_key,
        client_secret: config.opel_api.api_secret,
      });

      this.accessToken = response.data.access_token;
      this.tokenExpiry = now + response.data.expires_in;

      logger.info('Successfully authenticated with Opel API');
    } catch (error) {
      logger.error('Failed to authenticate with Opel API', error);
      throw new AppError(
        ErrorCode.OPEL_API_ERROR,
        'Failed to authenticate with Opel API',
        error,
        500,
      );
    }
  }

  /**
   * Get vehicle pricing
   */
  async getVehiclePricing(model: string, trim?: string): Promise<VehicleModel> {
    try {
      logger.debug('Fetching vehicle pricing', { model, trim });

      const response = await this.circuitBreaker.execute(
        async () => {
          return await retryWithBackoff(
            async () => await this.client.get(`/vehicles/${model}/pricing`),
            {
              maxAttempts: 3,
              retryIf: shouldRetryNetworkError,
            },
          );
        },
        async () => {
          // Fallback: return cached data or default
          logger.warn('Using fallback for vehicle pricing');
          throw new AppError(
            ErrorCode.OPEL_API_ERROR,
            'Service temporarily unavailable',
            undefined,
            503,
          );
        },
      );

      const vehicleData: VehicleModel = response.data;

      // Filter by trim if specified
      if (trim) {
        vehicleData.trim_levels = vehicleData.trim_levels.filter(
          (t) => t.name.toLowerCase() === trim.toLowerCase(),
        );
      }

      logger.info('Successfully fetched vehicle pricing', { model, trim, trim_count: vehicleData.trim_levels.length });

      return vehicleData;
    } catch (error) {
      logger.error('Failed to fetch vehicle pricing', { model, error });
      throw new AppError(
        ErrorCode.OPEL_API_ERROR,
        `Failed to fetch pricing for ${model}`,
        error,
        500,
      );
    }
  }

  /**
   * Check stock availability
   */
  async checkStockAvailability(model: string, color: string, dealerId?: string): Promise<StockAvailability> {
    try {
      logger.debug('Checking stock availability', { model, color, dealerId });

      const params: any = { model, color };
      if (dealerId) params.dealer = dealerId;

      const response = await retryWithBackoff(async () => {
        return await this.client.get('/inventory/availability', { params });
      });

      const stockData: StockAvailability = response.data;

      logger.info('Successfully checked stock availability', {
        model,
        color,
        available: stockData.available,
        quantity: stockData.quantity,
      });

      return stockData;
    } catch (error) {
      logger.error('Failed to check stock availability', { model, color, error });
      throw new AppError(
        ErrorCode.OPEL_API_ERROR,
        `Failed to check stock for ${model}`,
        error,
        500,
      );
    }
  }

  /**
   * Create appointment (test drive or service)
   */
  async createAppointment(request: AppointmentRequest): Promise<AppointmentResponse> {
    try {
      logger.debug('Creating appointment', { type: request.type });

      const response = await retryWithBackoff(async () => {
        return await this.client.post('/appointments', request);
      });

      const appointmentData: AppointmentResponse = response.data;

      logger.info('Successfully created appointment', {
        appointment_id: appointmentData.appointment_id,
        type: request.type,
      });

      return appointmentData;
    } catch (error: any) {
      logger.error('Failed to create appointment', { request, error });

      // Handle specific errors
      if (error.response?.status === 409) {
        throw new AppError(
          ErrorCode.APPOINTMENT_NOT_AVAILABLE,
          'The requested time slot is not available',
          error,
          409,
        );
      }

      throw new AppError(
        ErrorCode.OPEL_API_ERROR,
        'Failed to create appointment',
        error,
        500,
      );
    }
  }

  /**
   * Get customer by phone number
   */
  async getCustomerByPhone(phone: string): Promise<any | null> {
    try {
      logger.debug('Fetching customer by phone', { phone });

      const response = await retryWithBackoff(async () => {
        return await this.client.get(`/customers/phone/${phone}`);
      });

      const customerData = response.data;

      logger.info('Successfully fetched customer', { customer_id: customerData.customer_id });

      return customerData;
    } catch (error: any) {
      if (error.response?.status === 404) {
        logger.debug('Customer not found', { phone });
        return null;
      }

      logger.error('Failed to fetch customer', { phone, error });
      throw new AppError(
        ErrorCode.OPEL_API_ERROR,
        'Failed to fetch customer',
        error,
        500,
      );
    }
  }

  /**
   * Verify chassis number
   */
  async verifyChassisNumber(chassis: string): Promise<any | null> {
    try {
      logger.debug('Verifying chassis number', { chassis });

      const response = await retryWithBackoff(async () => {
        return await this.client.get(`/vehicles/chassis/${chassis}`);
      });

      const vehicleData = response.data;

      logger.info('Successfully verified chassis', { chassis });

      return vehicleData;
    } catch (error: any) {
      if (error.response?.status === 404) {
        logger.debug('Chassis not found', { chassis });
        return null;
      }

      logger.error('Failed to verify chassis', { chassis, error });
      throw new AppError(
        ErrorCode.OPEL_API_ERROR,
        'Failed to verify chassis number',
        error,
        500,
      );
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health', { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      logger.error('Opel API health check failed', error);
      return false;
    }
  }
}

// Export singleton instance
export const opelAPIAdapter = new OpelAPIAdapter();
