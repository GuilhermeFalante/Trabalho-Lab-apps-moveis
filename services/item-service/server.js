const express = require('express');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const serviceRegistry = require('../../shared/serviceRegistry');

const path = require('path');
const JsonDatabase = require('../../shared/JsonDatabase');

// Usar caminho absoluto para o arquivo JSON
const itemsFilePath = path.join(__dirname, 'database', 'items.json');

// Instanciar o DB
const db = new JsonDatabase(itemsFilePath);

const app = express();
app.use(express.json());

// Helper function to read items from the database
function readItems() {
  try {
    return db.read() || [];
  } catch (err) {
    console.error('Erro ao ler items do JsonDatabase:', err.message);
    return [];
  }
}

// Helper function to write items to the database
function writeItems(items) {
  try {
    db.write(items);
  } catch (err) {
    console.error('Erro ao escrever items no JsonDatabase:', err.message);
  }
}

// Middleware para autenticação JWT
// ...removed authenticateJWT function...

// GET /items - Listar itens com filtros (categoria, nome)
app.get('/items', (req, res) => {
  const { category, name } = req.query;
  let items = readItems();

  if (category) {
    items = items.filter(item => item.category.toLowerCase() === category.toLowerCase());
  }
  if (name) {
    items = items.filter(item => item.name.toLowerCase().includes(name.toLowerCase()));
  }

  res.json(items);
});

// GET /items/:id - Buscar item específico
app.get('/items/:id', (req, res) => {
  const { id } = req.params;
  const items = readItems();
  const item = items.find(item => item.id === id);

  if (!item) {
    return res.status(404).json({ message: 'Item not found' });
  }

  res.json(item);
});

// POST /items - Criar novo item (sem autenticação)
app.post('/items', (req, res) => {
  const newItem = { ...req.body, id: uuidv4(), createdAt: Date.now() };
  const items = readItems();
  items.push(newItem);
  writeItems(items);

  res.status(201).json(newItem);
});

// PUT /items/:id - Atualizar item (sem autenticação)
app.put('/items/:id', (req, res) => {
  const { id } = req.params;
  const updatedData = req.body;
  const items = readItems();
  const itemIndex = items.findIndex(item => item.id === id);

  if (itemIndex === -1) {
    return res.status(404).json({ message: 'Item not found' });
  }

  items[itemIndex] = { ...items[itemIndex], ...updatedData, updatedAt: Date.now() };
  writeItems(items);

  res.json(items[itemIndex]);
});

// GET /categories - Listar categorias disponíveis
app.get('/categories', (req, res) => {
  const items = readItems();
  const categories = [...new Set(items.map(item => item.category))];
  res.json(categories);
});

// GET /search?q=termo - Buscar itens por nome
app.get('/search', (req, res) => {
  const { q } = req.query;
  if (!q) {
    return res.status(400).json({ message: 'Search term is required' });
  }

  const items = readItems();
  const results = items.filter(item => item.name.toLowerCase().includes(q.toLowerCase()));
  res.json(results);
});

// GET /health 
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'item-service',
    timestamp: Date.now()
  });
});

// Start the server
const PORT = 3003; // Porta do item-service
app.listen(PORT, () => {
  console.log(`Item service running on port ${PORT}`);

  // Registrar o serviço no serviceRegistry
  serviceRegistry.register('item-service', {
    url: `http://localhost:${PORT}`
  });
});
  res.json({
    status: 'OK',
    service: 'item-service',
    timestamp: Date.now()
  });

