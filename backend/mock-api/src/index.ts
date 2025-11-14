import express, { Request, Response } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Simulated latency (100-500ms)
const simulateLatency = () => new Promise((resolve) => setTimeout(resolve, Math.random() * 400 + 100));

/**
 * Mock vehicle data
 */
const vehicles = {
  Corsa: {
    model: 'Corsa',
    trim_levels: [
      {
        name: 'Elegance',
        base_price: 750000,
        currency: 'TRY',
        available_colors: ['red', 'white', 'black', 'blue', 'silver'],
        features: ['Otomatik klima', '16" alüminyum jantlar', 'Bluetooth', 'Geri görüş kamerası'],
      },
      {
        name: 'GS Line',
        base_price: 850000,
        currency: 'TRY',
        available_colors: ['red', 'white', 'black', 'blue', 'silver', 'gray'],
        features: [
          'Otomatik klima',
          '17" alüminyum jantlar',
          'Bluetooth',
          'Geri görüş kamerası',
          'LED farlar',
          'Spor direksiyon',
        ],
      },
      {
        name: 'Ultimate',
        base_price: 950000,
        currency: 'TRY',
        available_colors: ['red', 'white', 'black', 'blue', 'silver', 'gray'],
        features: [
          'Otomatik klima',
          '18" alüminyum jantlar',
          'Bluetooth',
          'Geri görüş kamerası',
          'Matrix LED farlar',
          'Deri döşeme',
          'Panoramik cam tavan',
        ],
      },
    ],
  },
  Astra: {
    model: 'Astra',
    trim_levels: [
      {
        name: 'Elegance',
        base_price: 950000,
        currency: 'TRY',
        available_colors: ['red', 'white', 'black', 'blue', 'silver'],
      },
      {
        name: 'GS Line',
        base_price: 1050000,
        currency: 'TRY',
        available_colors: ['red', 'white', 'black', 'blue', 'silver', 'gray'],
      },
    ],
  },
  Grandland: {
    model: 'Grandland',
    trim_levels: [
      {
        name: 'Elegance',
        base_price: 1200000,
        currency: 'TRY',
        available_colors: ['red', 'white', 'black', 'blue', 'silver'],
      },
      {
        name: 'Ultimate',
        base_price: 1400000,
        currency: 'TRY',
        available_colors: ['red', 'white', 'black', 'blue', 'silver', 'gray'],
      },
    ],
  },
  Mokka: {
    model: 'Mokka',
    trim_levels: [
      {
        name: 'Elegance',
        base_price: 980000,
        currency: 'TRY',
        available_colors: ['red', 'white', 'black', 'blue', 'silver'],
      },
      {
        name: 'GS Line',
        base_price: 1080000,
        currency: 'TRY',
        available_colors: ['red', 'white', 'black', 'blue', 'silver', 'gray'],
      },
    ],
  },
};

/**
 * Mock stock inventory
 */
const stockInventory: Record<string, any> = {
  'Corsa-red': { quantity: 5, delivery_days: 0 },
  'Corsa-white': { quantity: 8, delivery_days: 0 },
  'Corsa-black': { quantity: 3, delivery_days: 0 },
  'Corsa-blue': { quantity: 0, delivery_days: 14 },
  'Corsa-silver': { quantity: 2, delivery_days: 0 },
  'Astra-red': { quantity: 2, delivery_days: 0 },
  'Astra-white': { quantity: 4, delivery_days: 0 },
  'Astra-black': { quantity: 0, delivery_days: 21 },
  'Grandland-white': { quantity: 1, delivery_days: 0 },
  'Grandland-black': { quantity: 0, delivery_days: 30 },
  'Mokka-red': { quantity: 3, delivery_days: 0 },
  'Mokka-white': { quantity: 6, delivery_days: 0 },
};

/**
 * Mock dealer locations
 */
const dealers = [
  { id: 'IST-001', name: 'Opel Istanbul Yetkili Servisi', city: 'Istanbul' },
  { id: 'ANK-001', name: 'Opel Ankara Yetkili Servisi', city: 'Ankara' },
  { id: 'IZM-001', name: 'Opel Izmir Yetkili Servisi', city: 'Izmir' },
];

/**
 * Health check
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'mock-opel-api', timestamp: Date.now() });
});

/**
 * Get vehicle pricing
 * GET /vehicles/:model/pricing
 */
app.get('/vehicles/:model/pricing', async (req: Request, res: Response) => {
  await simulateLatency();

  const { model } = req.params;
  const vehicleData = vehicles[model as keyof typeof vehicles];

  if (!vehicleData) {
    return res.status(404).json({
      error: {
        code: 'VEHICLE_NOT_FOUND',
        message: `Vehicle model ${model} not found`,
      },
    });
  }

  res.json(vehicleData);
});

/**
 * Check stock availability
 * GET /inventory/availability?model=Corsa&color=red&dealer=IST-001
 */
app.get('/inventory/availability', async (req: Request, res: Response) => {
  await simulateLatency();

  const { model, color, dealer } = req.query;

  if (!model || !color) {
    return res.status(400).json({
      error: {
        code: 'MISSING_PARAMETERS',
        message: 'Model and color are required',
      },
    });
  }

  const stockKey = `${model}-${color}`;
  const stock = stockInventory[stockKey];

  if (!stock) {
    // Random stock for unlisted combinations
    const randomStock = {
      quantity: Math.floor(Math.random() * 10),
      delivery_days: Math.random() > 0.7 ? Math.floor(Math.random() * 30) : 0,
    };

    return res.json({
      available: randomStock.quantity > 0,
      quantity: randomStock.quantity,
      delivery_estimate_days: randomStock.delivery_days,
      dealer_locations: dealers.slice(0, Math.floor(Math.random() * 3) + 1),
    });
  }

  res.json({
    available: stock.quantity > 0,
    quantity: stock.quantity,
    delivery_estimate_days: stock.delivery_days,
    dealer_locations: stock.quantity > 0 ? dealers : [],
  });
});

/**
 * Create appointment
 * POST /appointments
 */
app.post('/appointments', async (req: Request, res: Response) => {
  await simulateLatency();

  const { type, customer, vehicle_model, preferred_datetime, dealer_id } = req.body;

  // Validate required fields
  if (!type || !customer || !preferred_datetime || !dealer_id) {
    return res.status(400).json({
      error: {
        code: 'MISSING_FIELDS',
        message: 'Required fields: type, customer, preferred_datetime, dealer_id',
      },
    });
  }

  // Validate customer fields
  if (!customer.name || !customer.phone) {
    return res.status(400).json({
      error: {
        code: 'INVALID_CUSTOMER',
        message: 'Customer name and phone are required',
      },
    });
  }

  // Simulate occasional booking conflicts (5% chance)
  if (Math.random() < 0.05) {
    return res.status(409).json({
      error: {
        code: 'SLOT_UNAVAILABLE',
        message: 'The requested time slot is no longer available',
      },
    });
  }

  // Create appointment
  const appointmentId = `MOCK-${uuidv4().split('-')[0].toUpperCase()}`;
  const confirmationCode = `${type === 'test_drive' ? 'TD' : 'SV'}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  res.status(201).json({
    appointment_id: appointmentId,
    status: 'confirmed',
    confirmation_code: confirmationCode,
    dealer: dealers.find((d) => d.id === dealer_id) || dealers[0],
  });
});

/**
 * Get customer by phone
 * GET /customers/phone/:phone
 */
app.get('/customers/phone/:phone', async (req: Request, res: Response) => {
  await simulateLatency();

  const { phone } = req.params;

  // Simulate known customers (50% chance)
  if (Math.random() < 0.5) {
    res.json({
      customer_id: `CUST-${uuidv4().split('-')[0]}`,
      name: 'Ahmet Yılmaz',
      phone: phone,
      email: 'ahmet@example.com',
      is_vip: Math.random() < 0.1,
      owned_vehicles: [
        {
          plate: '34ABC123',
          model: 'Corsa',
          year: 2022,
          chassis_number: 'W0L1234567890',
        },
      ],
    });
  } else {
    res.status(404).json({
      error: {
        code: 'CUSTOMER_NOT_FOUND',
        message: 'Customer not found',
      },
    });
  }
});

/**
 * Verify chassis number
 * GET /vehicles/chassis/:chassis
 */
app.get('/vehicles/chassis/:chassis', async (req: Request, res: Response) => {
  await simulateLatency();

  const { chassis } = req.params;

  // Simulate verification (80% success)
  if (Math.random() < 0.8) {
    res.json({
      chassis_number: chassis,
      model: ['Corsa', 'Astra', 'Mokka'][Math.floor(Math.random() * 3)],
      year: 2020 + Math.floor(Math.random() * 5),
      owner: {
        name: 'Ahmet Yılmaz',
        phone: '+905551234567',
      },
      last_service_date: '2024-08-15',
      next_service_due: '2025-02-15',
    });
  } else {
    res.status(404).json({
      error: {
        code: 'CHASSIS_NOT_FOUND',
        message: 'Vehicle not found with this chassis number',
      },
    });
  }
});

/**
 * Error handler
 */
app.use((err: any, req: Request, res: Response, next: any) => {
  console.error('Error:', err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An internal error occurred',
    },
  });
});

/**
 * Start server
 */
app.listen(PORT, () => {
  console.log(`🚗 Mock Opel API running on http://localhost:${PORT}`);
  console.log(`📊 Available endpoints:`);
  console.log(`   GET  /health`);
  console.log(`   GET  /vehicles/:model/pricing`);
  console.log(`   GET  /inventory/availability`);
  console.log(`   POST /appointments`);
  console.log(`   GET  /customers/phone/:phone`);
  console.log(`   GET  /vehicles/chassis/:chassis`);
});

export default app;
