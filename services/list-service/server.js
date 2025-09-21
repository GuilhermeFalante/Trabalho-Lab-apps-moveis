const express = require('express');
const { v4: uuidv4 } = require('uuid');
const serviceRegistry = require('../../shared/serviceRegistry');
const path = require('path');
const JsonDatabase = require('../../shared/JsonDatabase');
const fs = require('fs');
const axios = require('axios');
const jwt = require('jsonwebtoken'); 

const PORT = 3002;
const dbDirectory = path.join(__dirname, 'database');

fs.mkdirSync(dbDirectory, { recursive: true });

const listDb = new JsonDatabase(dbDirectory, 'lists');

const app = express();
app.use(express.json());

const listSchema = {
  id: '',
  userId: '',
  name: '',
  description: '',
  status: 'active',
  items: [],
  summary: {
    totalItems: 0,
    purchasedItems: 0,
    estimatedTotal: 0,
  },
  createdAt: '',
  updatedAt: ''
};

async function validateUserId(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de autenticação obrigatório' });
    }

    const token = authHeader.replace('Bearer ', '');
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'user-secret');
    const userId = decoded.id;

    if (!userId) {
      return res.status(401).json({ error: 'Token inválido: userId não encontrado' });
    }

    const requestUserId = req.query.userId || req.body.userId;
    
    if (requestUserId && requestUserId !== userId) {
      return res.status(403).json({ error: 'Acesso negado: token não corresponde ao userId' });
    }

    req.userId = userId;
    next();
  } catch (error) {
    console.error('Erro ao validar token:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado' });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token inválido' });
    }

    res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

async function checkListOwnership(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.userId;

    const list = await listDb.findById(id);
    
    if (!list) {
      return res.status(404).json({ error: 'Lista não encontrada' });
    }

    if (list.userId !== userId) {
      return res.status(403).json({ error: 'Acesso negado. Esta lista pertence a outro usuário.' });
    }

    req.list = list;
    next();
  } catch (error) {
    console.error('Erro ao verificar propriedade da lista:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

async function getItemInfo(itemId) {
  try {
    const itemService = serviceRegistry.discover('item-service');
    const response = await axios.get(`${itemService.url}/items/${itemId}`);
    return response.data;
  } catch (error) {
    console.error('Erro ao buscar informações do item:', error.message);
    return null;
  }
}

function calculateListSummary(items) {
  const totalItems = items.length;
  const purchasedItems = items.filter(item => item.purchased).length;
  const estimatedTotal = items.reduce((total, item) => {
    return total + (item.estimatedPrice * item.quantity);
  }, 0);

  return { totalItems, purchasedItems, estimatedTotal };
}

async function updateListSummary(listId) {
  try {
    const list = await listDb.findById(listId);
    if (!list) return;

    const summary = calculateListSummary(list.items);
    await listDb.update(listId, { 
      summary,
      updatedAt: new Date().toISOString() 
    });
  } catch (error) {
    console.error('Erro ao atualizar resumo da lista:', error);
  }
}

app.post('/lists', validateUserId, async (req, res) => {
  try {
    const { name, description, status = 'active' } = req.body;
    const userId = req.userId;

    if (!name) {
      return res.status(400).json({ error: 'name é obrigatório' });
    }

    // Validar status
    const validStatuses = ['active', 'completed', 'archived'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Status inválido. Use: active, completed ou archived' });
    }

    const newList = {
      ...listSchema,
      id: uuidv4(),
      userId,
      name,
      description: description || '',
      status,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const createdList = await listDb.create(newList);
    res.status(201).json(createdList);
  } catch (error) {
    console.error('Erro ao criar lista:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.get('/lists', validateUserId, async (req, res) => {
  try {
    const { status } = req.query;
    const userId = req.userId;

    const filter = { userId };
    if (status) {
      const validStatuses = ['active', 'completed', 'archived'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Status inválido. Use: active, completed ou archived' });
      }
      filter.status = status;
    }

    const userLists = await listDb.find(filter);
    res.status(200).json(userLists);
  } catch (error) {
    console.error('Erro ao buscar listas:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.get('/lists/:id', validateUserId, checkListOwnership, async (req, res) => {
  res.status(200).json(req.list);
});

app.put('/lists/:id', validateUserId, checkListOwnership, async (req, res) => {
  try {
    const { name, description, status } = req.body;
    const updates = { updatedAt: new Date().toISOString() };

    if (name) updates.name = name;
    if (description !== undefined) updates.description = description;
    
    if (status) {
      const validStatuses = ['active', 'completed', 'archived'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Status inválido. Use: active, completed ou archived' });
      }
      updates.status = status;
    }

    const updatedList = await listDb.update(req.params.id, updates);
    res.status(200).json(updatedList);
  } catch (error) {
    console.error('Erro ao atualizar lista:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// DELETE /lists/:id - Deletar lista
app.delete('/lists/:id', validateUserId, checkListOwnership, async (req, res) => {
  try {
    await listDb.delete(req.params.id);
    res.status(200).json({ message: 'Lista deletada com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar lista:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// POST /lists/:id/items - Adicionar item à lista
app.post('/lists/:id/items', validateUserId, checkListOwnership, async (req, res) => {
  try {
    const { itemId, quantity = 1, unit = 'un', notes = '' } = req.body;

    if (!itemId) {
      return res.status(400).json({ error: 'itemId é obrigatório' });
    }

    // Buscar informações do item no Item Service
    const itemInfo = await getItemInfo(itemId);
    
    if (!itemInfo) {
      return res.status(404).json({ error: 'Item não encontrado no catálogo' });
    }

    const newItem = {
      id: uuidv4(), 
      itemId: itemInfo.id, 
      itemName: itemInfo.name, 
      quantity,
      unit: unit || itemInfo.unit || 'un',
      estimatedPrice: itemInfo.averagePrice || 0,
      purchased: false,
      notes,
      addedAt: new Date().toISOString()
    };

    const list = req.list;
    list.items.push(newItem);
    
    const updatedList = await listDb.update(req.params.id, {
      items: list.items,
      updatedAt: new Date().toISOString()
    });

    await updateListSummary(req.params.id);

    res.status(201).json(updatedList);
  } catch (error) {
    console.error('Erro ao adicionar item à lista:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// PUT /lists/:id/items/:itemId - Atualizar item na lista
app.put('/lists/:id/items/:itemId', validateUserId, checkListOwnership, async (req, res) => {
  try {
    const { itemId } = req.params;
    const { quantity, unit, estimatedPrice, purchased, notes } = req.body;

    const list = req.list;
    const itemIndex = list.items.findIndex(item => item.id === itemId);

    if (itemIndex === -1) {
      return res.status(404).json({ error: 'Item não encontrado na lista' });
    }

    if (quantity !== undefined) list.items[itemIndex].quantity = quantity;
    if (unit !== undefined) list.items[itemIndex].unit = unit;
    if (estimatedPrice !== undefined) list.items[itemIndex].estimatedPrice = estimatedPrice;
    if (purchased !== undefined) list.items[itemIndex].purchased = purchased;
    if (notes !== undefined) list.items[itemIndex].notes = notes;

    const updatedList = await listDb.update(req.params.id, {
      items: list.items,
      updatedAt: new Date().toISOString()
    });

    await updateListSummary(req.params.id);

    res.status(200).json(updatedList);
  } catch (error) {
    console.error('Erro ao atualizar item na lista:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// DELETE /lists/:id/items/:itemId - Remover item da lista
app.delete('/lists/:id/items/:itemId', validateUserId, checkListOwnership, async (req, res) => {
  try {
    const { itemId } = req.params;

    const list = req.list;
    const filteredItems = list.items.filter(item => item.id !== itemId);

    if (filteredItems.length === list.items.length) {
      return res.status(404).json({ error: 'Item não encontrado na lista' });
    }

    const updatedList = await listDb.update(req.params.id, {
      items: filteredItems,
      updatedAt: new Date().toISOString()
    });

    // Atualizar resumo da lista
    await updateListSummary(req.params.id);

    res.status(200).json(updatedList);
  } catch (error) {
    console.error('Erro ao remover item da lista:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// GET /lists/:id/summary - Resumo da lista
app.get('/lists/:id/summary', validateUserId, checkListOwnership, async (req, res) => {
  try {
    const summary = calculateListSummary(req.list.items);
    res.status(200).json(summary);
  } catch (error) {
    console.error('Erro ao calcular resumo da lista:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'list-service',
    timestamp: Date.now()
  });
});

// Inicializar o servidor
app.listen(PORT, () => {
  console.log(`List service running on port ${PORT}`);

  serviceRegistry.register('list-service', {
    url: `http://localhost:${PORT}`
  });
});

module.exports = app;