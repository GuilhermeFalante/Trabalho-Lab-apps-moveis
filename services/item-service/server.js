const express = require('express');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const serviceRegistry = require('../../shared/serviceRegistry');
const path = require('path');
const JsonDatabase = require('../../shared/JsonDatabase');

const dbDirectory = path.join(__dirname, 'database');

fs.mkdirSync(dbDirectory, { recursive: true });

const db = new JsonDatabase(dbDirectory, 'items');

const app = express();
app.use(express.json());

async function readItems() {
  try {
    return await db.readAll() || [];
  } catch (err) {
    console.error('Erro ao ler items do JsonDatabase:', err.message);
    return [];
  }
}

async function writeItems(items) {
  try {
    await db.writeAll(items);
  } catch (err) {
    console.error('Erro ao escrever items no JsonDatabase:', err.message);
  }
}

app.get('/items', async (req, res) => {
  const { category, name } = req.query;
  let items = await readItems();

  if (category) {
    items = items.filter(item => item.category && item.category.toLowerCase() === category.toLowerCase());
  }
  if (typeof name === 'string' && name.trim() !== '') {
    items = items.filter(item => typeof item.name === 'string' && item.name.toLowerCase().includes(name.toLowerCase()));
  }

  res.json(items);
});

app.get('/items/:id', async (req, res) => {
  const { id } = req.params;
  const items = await readItems();
  const item = items.find(item => item.id === id);

  if (!item) {
    return res.status(404).json({ message: 'Item not found' });
  }

  res.json(item);
});

app.post('/items', async (req, res) => {
  const newItem = { ...req.body, id: uuidv4(), createdAt: new Date().toISOString() };
  const items = await readItems();
  items.push(newItem);
  await writeItems(items);

  res.status(201).json(newItem);
});

app.put('/items/:id', async (req, res) => {
  const { id } = req.params;
  const updatedData = req.body;
  const items = await readItems();
  const itemIndex = items.findIndex(item => item.id === id);

  if (itemIndex === -1) {
    return res.status(404).json({ message: 'Item not found' });
  }

  items[itemIndex] = { 
    ...items[itemIndex], 
    ...updatedData, 
    updatedAt: new Date().toISOString() 
  };
  await writeItems(items);

  res.json(items[itemIndex]);
});

app.get('/categories', async (req, res) => {
  const items = await readItems();
  const categories = [...new Set(items.map(item => item.category))].filter(Boolean);
  res.json(categories);
});

app.get('/search', async (req, res) => {
  const { q, limit, sort } = req.query;
  let items = await readItems();

  let results = items;
  if (q) {
    results = results.filter(item => item.name && item.name.toLowerCase().includes(q.toLowerCase()));
  }

  // Ordenação por data de criação 
  if (sort === 'newest') {
    results = results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  // Limite de resultados
  let limitedResults = results;
  if (limit) {
    const lim = parseInt(limit, 10);
    if (!isNaN(lim)) {
      limitedResults = results.slice(0, lim);
    }
  }

  res.json({ results: limitedResults, total: results.length });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'item-service',
    timestamp: Date.now()
  });
});

async function seedInitialItems() {
  try {
    const existing = await readItems();
    if (existing && existing.length > 0) return;

    const now = new Date().toISOString();
    const initialItems = [
      { id: uuidv4(), name: 'Arroz Tipo 1', category: 'Alimentos', brand: 'ArrozBom', unit: 'kg', averagePrice: 4.5, barcode: '789000100001', description: 'Arroz branco 1kg', active: true, createdAt: now },
      { id: uuidv4(), name: 'Feijão Carioca', category: 'Alimentos', brand: 'FeijaoTop', unit: 'kg', averagePrice: 6.2, barcode: '789000100002', description: 'Feijão carioca 1kg', active: true, createdAt: now },
      { id: uuidv4(), name: 'Macarrão Espaguete 500g', category: 'Alimentos', brand: 'MassaFina', unit: 'un', averagePrice: 3.0, barcode: '789000100003', description: '500g', active: true, createdAt: now },
      { id: uuidv4(), name: 'Óleo de Soja 900ml', category: 'Alimentos', brand: 'OleoPuro', unit: 'litro', averagePrice: 7.5, barcode: '789000100004', description: '900ml', active: true, createdAt: now },
      { id: uuidv4(), name: 'Leite Integral 1L', category: 'Alimentos', brand: 'LeiteBom', unit: 'litro', averagePrice: 4.0, barcode: '789000100005', description: '1L', active: true, createdAt: now },

      { id: uuidv4(), name: 'Detergente Líquido 500ml', category: 'Limpeza', brand: 'LimpoJá', unit: 'un', averagePrice: 2.2, barcode: '789000200001', description: '500ml', active: true, createdAt: now },
      { id: uuidv4(), name: 'Desinfetante 1L', category: 'Limpeza', brand: 'Sanit', unit: 'litro', averagePrice: 5.0, barcode: '789000200002', description: '1L', active: true, createdAt: now },
      { id: uuidv4(), name: 'Sabão em Pó 1kg', category: 'Limpeza', brand: 'BrancoLimp', unit: 'kg', averagePrice: 8.5, barcode: '789000200003', description: '1kg', active: true, createdAt: now },
      { id: uuidv4(), name: 'Álcool Gel 70% 300ml', category: 'Limpeza', brand: 'SafeHand', unit: 'un', averagePrice: 6.0, barcode: '789000200004', description: '300ml', active: true, createdAt: now },

      { id: uuidv4(), name: 'Papel Higiênico 4 rolos', category: 'Higiene', brand: 'Macio', unit: 'un', averagePrice: 5.5, barcode: '789000300001', description: '4 rolos', active: true, createdAt: now },
      { id: uuidv4(), name: 'Sabonete Barra', category: 'Higiene', brand: 'Aroma', unit: 'un', averagePrice: 1.8, barcode: '789000300002', description: '90g', active: true, createdAt: now },
      { id: uuidv4(), name: 'Shampoo 350ml', category: 'Higiene', brand: 'Cabelos', unit: 'un', averagePrice: 9.0, barcode: '789000300003', description: '350ml', active: true, createdAt: now },

      { id: uuidv4(), name: 'Refrigerante 2L', category: 'Bebidas', brand: 'Frescor', unit: 'litro', averagePrice: 7.0, barcode: '789000400001', description: '2L', active: true, createdAt: now },
      { id: uuidv4(), name: 'Cerveja Lata 350ml', category: 'Bebidas', brand: 'Brilha', unit: 'un', averagePrice: 3.5, barcode: '789000400002', description: '350ml', active: true, createdAt: now },
      { id: uuidv4(), name: 'Suco Natural 1L', category: 'Bebidas', brand: 'Frutti', unit: 'litro', averagePrice: 6.5, barcode: '789000400003', description: '1L', active: true, createdAt: now },

      { id: uuidv4(), name: 'Pão Francês 10un', category: 'Padaria', brand: 'Padoca', unit: 'un', averagePrice: 4.0, barcode: '789000500001', description: '10 unidades', active: true, createdAt: now },
      { id: uuidv4(), name: 'Pão Integral 500g', category: 'Padaria', brand: 'Integral', unit: 'un', averagePrice: 5.0, barcode: '789000500002', description: '500g', active: true, createdAt: now },
      { id: uuidv4(), name: 'Bolo Caseiro 1kg', category: 'Padaria', brand: 'DoceLar', unit: 'kg', averagePrice: 15.0, barcode: '789000500003', description: '1kg', active: true, createdAt: now },
    ];

    await writeItems(initialItems);
    console.log('Dados iniciais inseridos com sucesso!');
  } catch (error) {
    console.error('Erro ao inserir dados iniciais:', error);
  }
}

// Start the server
const PORT = 3003; 
app.listen(PORT, async () => {
  console.log(`Item service running on port ${PORT}`);

  await seedInitialItems();

  serviceRegistry.register('item-service', {
    url: `http://localhost:${PORT}`
  });
});