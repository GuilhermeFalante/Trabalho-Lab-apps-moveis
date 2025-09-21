const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const axios = require('axios');

const serviceRegistry = require('../shared/serviceRegistry');

class APIGateway {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;

        // Circuit breaker simples
        this.circuitBreakers = new Map();

        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
        setTimeout(() => {
            this.startHealthChecks();
        }, 3000);

        const servicesToRegister = [
            { name: 'user-service', url: 'http://localhost:3001' },
            { name: 'item-service', url: 'http://localhost:3003' },
            { name: 'list-service', url: 'http://localhost:3002' }
        ];

        servicesToRegister.forEach(service => {
            serviceRegistry.register(service.name, { url: service.url });
        });
    }

    setupMiddleware() {
        this.app.use(helmet());
        this.app.use(cors());
        this.app.use(morgan('combined'));
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));

        // Gateway headers
        this.app.use((req, res, next) => {
            res.setHeader('X-Gateway', 'api-gateway');
            res.setHeader('X-Gateway-Version', '1.0.0');
            res.setHeader('X-Architecture', 'Microservices-NoSQL');
            next();
        });

        // Request logging
        this.app.use((req, res, next) => {
            console.log(`${req.method} ${req.originalUrl} - ${req.ip}`);
            next();
        });

        this.app.use((req, res, next) => {
            const start = Date.now();
            res.on('finish', () => {
                const duration = Date.now() - start;
                console.log(`📝 [${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
            });
            next();
        });
    }

    setupRoutes() {
        // Gateway health check
        this.app.get('/health', (req, res) => {
            const services = serviceRegistry.listServices();
            res.json({
                service: 'api-gateway',
                status: 'healthy',
                timestamp: new Date().toISOString(),
                architecture: 'Microservices with NoSQL',
                services: services,
                serviceCount: Object.keys(services).length
            });
        });

        // Gateway info
        this.app.get('/', (req, res) => {
            res.json({
                service: 'API Gateway',
                version: '1.0.0',
                description: 'Gateway para microsserviços com NoSQL',
                architecture: 'Microservices with NoSQL databases',
                database_approach: 'Database per Service (JSON-NoSQL)',
                endpoints: {
                    auth: '/api/auth/*',
                    users: '/api/users/*',
                    items: '/api/items/*',
                    lists: '/api/lists/*',
                    health: '/health',
                    registry: '/registry',
                    dashboard: '/api/dashboard',
                    search: '/api/search'
                },
                services: serviceRegistry.listServices()
            });
        });

        // Service registry endpoint
        this.app.get('/registry', (req, res) => {
            const services = serviceRegistry.listServices();
            res.json({
                success: true,
                services: services,
                count: Object.keys(services).length,
                timestamp: new Date().toISOString()
            });
        });

        // Debug endpoint para troubleshooting
        this.app.get('/debug/services', (req, res) => {
            serviceRegistry.debugListServices();
            res.json({
                success: true,
                services: serviceRegistry.listServices(),
                stats: serviceRegistry.getStats()
            });
        });

        // Auth routes - user-service
        this.app.use('/api/auth', (req, res, next) => {
            console.log(`🔗 Roteando para user-service: ${req.method} ${req.originalUrl}`);
            this.proxyRequest('user-service', req, res, next);
        });

        // User Service routes
        this.app.use('/api/users', (req, res, next) => {
            console.log(`🔗 Roteando para user-service: ${req.method} ${req.originalUrl}`);
            this.proxyRequest('user-service', req, res, next);
        });

        // Item Service routes
        this.app.use('/api/items', (req, res, next) => {
            console.log(`🔗 Roteando para item-service: ${req.method} ${req.originalUrl}`);
            this.proxyRequest('item-service', req, res, next);
        });

        // List Service routes
        this.app.use('/api/lists', (req, res, next) => {
            console.log(`🔗 Roteando para list-service: ${req.method} ${req.originalUrl}`);
            this.proxyRequest('list-service', req, res, next);
        });

        // Endpoints agregados
        this.app.get('/api/dashboard', this.getDashboard.bind(this));
        this.app.get('/api/search', this.globalSearch.bind(this));
    }

    setupErrorHandling() {
        // 404 handler
        this.app.use('*', (req, res) => {
            res.status(404).json({
                success: false,
                message: 'Endpoint não encontrado',
                service: 'api-gateway',
                availableEndpoints: {
                    auth: '/api/auth',
                    users: '/api/users',
                    items: '/api/items',
                    lists: '/api/lists',
                    dashboard: '/api/dashboard',
                    search: '/api/search'
                }
            });
        });

        // Error handler

    }

    // Proxy request to service
    async proxyRequest(serviceName, req, res, next) {

        if (this.isCircuitOpen(serviceName)) {
            return res.status(503).json({
                success: false,
                message: `Serviço ${serviceName} temporariamente indisponível`
            });
        }

        try {
            let service;
            try {
                service = serviceRegistry.discover(serviceName);
            } catch (error) {
                console.error(`❌ Erro na descoberta do serviço ${serviceName}:`, error.message);
                const availableServices = serviceRegistry.listServices();
                console.log(`📋 Serviços disponíveis:`, Object.keys(availableServices));

                return res.status(503).json({
                    success: false,
                    message: `Serviço ${serviceName} não encontrado`,
                    service: serviceName,
                    availableServices: Object.keys(availableServices)
                });
            }

            const originalPath = req.originalUrl;
            let targetPath = originalPath;

            // Mapeamento de rotas específicas
            if (serviceName === 'user-service') {
                // /api/auth -> /auth, /api/users -> /users
                if (originalPath.startsWith('/api/auth')) {
                    targetPath = originalPath.replace('/api/auth', '/auth');
                } else if (originalPath.startsWith('/api/users')) {
                    targetPath = originalPath.replace('/api/users', '/users');
                }
            } else if (serviceName === 'item-service') {
                // /api/items -> /items
                targetPath = originalPath.replace('/api/items', '/items');
            } else if (serviceName === 'list-service') {
                // /api/lists -> /lists
                targetPath = originalPath.replace('/api/lists', '/lists');
            }

            if (!targetPath.startsWith('/')) {
                targetPath = '/' + targetPath;
            }

            if (targetPath === '/' || targetPath === '') {
                if (serviceName === 'user-service') targetPath = '/users';
                else if (serviceName === 'item-service') targetPath = '/items';
                else if (serviceName === 'list-service') targetPath = '/lists';
            }

            const targetUrl = `${service.url}${targetPath}`;

            console.log(`🎯 Target URL: ${targetUrl}`);

            // Configurar requisição
            const config = {
                method: req.method,
                url: targetUrl,
                headers: { ...req.headers },
                timeout: 10000,
                family: 4,
                validateStatus: function (status) {
                    return status < 500;
                }
            };

            if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
                config.data = req.body;
            }

            if (Object.keys(req.query).length > 0) {
                config.params = req.query;
            }

            delete config.headers.host;
            delete config.headers['content-length'];

            console.log(`📤 Enviando ${req.method} para ${targetUrl}`);

            const response = await axios(config);

            this.resetCircuitBreaker(serviceName);

            console.log(`📥 Resposta recebida: ${response.status}`);

            // Retornar resposta
            res.status(response.status).json(response.data);

        } catch (error) {
            // Registrar falha
            this.recordFailure(serviceName);

            console.error(`❌ Proxy error for ${serviceName}:`, {
                message: error.message,
                code: error.code,
                url: error.config?.url,
                status: error.response?.status
            });

            if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
                res.status(503).json({
                    success: false,
                    message: `Serviço ${serviceName} indisponível`,
                    service: serviceName,
                    error: error.code
                });
            } else if (error.response) {
                // Encaminhar resposta de erro do serviço
                console.log(`🔄 Encaminhando erro ${error.response.status} do serviço`);
                res.status(error.response.status).json(error.response.data);
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Erro interno do gateway',
                    service: 'api-gateway',
                    error: error.message
                });
            }
        }
    }

    // Circuit Breaker 
    isCircuitOpen(serviceName) {
        const breaker = this.circuitBreakers.get(serviceName) || { failures: 0, isOpen: false, lastFailure: 0 };
        if (breaker.isOpen && Date.now() - breaker.lastFailure < 300000) {
            return true;
        }
        if (breaker.isOpen) {
            breaker.isOpen = false;
            breaker.failures = 0;
            this.circuitBreakers.set(serviceName, breaker);
        }
        return false;
    }

    recordFailure(serviceName) {
        const breaker = this.circuitBreakers.get(serviceName) || { failures: 0, isOpen: false };
        breaker.failures++;
        breaker.lastFailure = Date.now();
        if (breaker.failures >= 3) {
            breaker.isOpen = true;
            console.log(`Circuit breaker aberto para ${serviceName}`);
        }
        this.circuitBreakers.set(serviceName, breaker);
    }

    resetCircuitBreaker(serviceName) {
        const breaker = this.circuitBreakers.get(serviceName);
        if (breaker) {
            breaker.failures = 0;
            breaker.isOpen = false;
            console.log(`Circuit breaker resetado para ${serviceName}`);
        }
    }

    async getDashboard(req, res) {
        try {
            const authHeader = req.header('Authorization');

            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({
                    success: false,
                    message: 'Token de autenticação obrigatório'
                });
            }

            const token = authHeader.replace('Bearer ', '');

            let userInfo = null;
            try {
                const userService = serviceRegistry.discover('user-service');
                const userRes = await axios.post(`${userService.url}/auth/validate`,
                    { token },
                    { timeout: 5000 }
                );
                userInfo = userRes.data.data?.user;
            } catch (error) {
                console.warn('Erro ao buscar informações do usuário:', error.message);
            }

            let userLists = [];
            let listStats = {
                total: 0,
                active: 0,
                completed: 0,
                archived: 0
            };

            try {
                const listService = serviceRegistry.discover('list-service');
                const listsRes = await axios.get(`${listService.url}/lists`, {
                    headers: { Authorization: `Bearer ${token}` },
                    timeout: 5000
                });
                userLists = listsRes.data;

                listStats.total = userLists.length;
                userLists.forEach(list => {
                    if (list.status === 'active') listStats.active++;
                    if (list.status === 'completed') listStats.completed++;
                    if (list.status === 'archived') listStats.archived++;
                });
            } catch (error) {
                console.warn('Erro ao buscar listas:', error.message);
            }

            let totalItems = 0;
            let totalPurchased = 0;
            let estimatedTotal = 0;

            try {
                userLists.forEach(list => {
                    totalItems += list.summary?.totalItems || 0;
                    totalPurchased += list.summary?.purchasedItems || 0;
                    estimatedTotal += list.summary?.estimatedTotal || 0;
                });
            } catch (error) {
                console.warn('Erro ao calcular estatísticas de itens:', error.message);
            }

            let popularCategories = [];
            try {
                const itemService = serviceRegistry.discover('item-service');
                const categoriesRes = await axios.get(`${itemService.url}/categories`, {
                    timeout: 5000
                });
                popularCategories = categoriesRes.data.slice(0, 5);
            } catch (error) {
                console.warn('Erro ao buscar categorias:', error.message);
            }

            const dashboardData = {
                user: userInfo ? {
                    id: userInfo.id,
                    username: userInfo.username,
                    email: userInfo.email,
                    firstName: userInfo.firstName,
                    lastName: userInfo.lastName
                } : null,
                statistics: {
                    lists: listStats,
                    items: {
                        total: totalItems,
                        purchased: totalPurchased,
                        remaining: totalItems - totalPurchased,
                        completionRate: totalItems > 0 ? Math.round((totalPurchased / totalItems) * 100) : 0
                    },
                    financial: {
                        estimatedTotal: Math.round(estimatedTotal * 100) / 100,
                        averagePerItem: totalItems > 0 ? Math.round((estimatedTotal / totalItems) * 100) / 100 : 0
                    }
                },
                recentActivity: userLists.slice(0, 3).map(list => ({
                    id: list.id,
                    name: list.name,
                    status: list.status,
                    itemsCount: list.summary?.totalItems || 0,
                    updatedAt: list.updatedAt
                })),
                popularCategories,
                lastUpdated: new Date().toISOString()
            };

            res.json({
                success: true,
                message: 'Dashboard data retrieved successfully',
                data: dashboardData
            });

        } catch (error) {
            console.error('Erro no dashboard:', error);
            res.status(500).json({
                success: false,
                message: 'Erro interno ao gerar dashboard',
                error: error.message
            });
        }
    }

    async globalSearch(req, res) {
        try {
            const { q } = req.query;

            if (!q) {
                return res.status(400).json({
                    success: false,
                    message: 'Parâmetro de busca "q" é obrigatório'
                });
            }

            const [itemResults] = await Promise.allSettled([
                this.callService('item-service', '/search', 'GET', null, { q })
            ]);

            const results = {
                query: q,
                items: {
                    available: itemResults.status === 'fulfilled',
                    results: itemResults.status === 'fulfilled' ? itemResults.value : [],
                    error: itemResults.status === 'rejected' ? itemResults.reason.message : null
                }
            };

            res.json({
                success: true,
                data: results
            });

        } catch (error) {
            console.error('Erro na busca global:', error);
            res.status(500).json({
                success: false,
                message: 'Erro na busca'
            });
        }
    }

    // Helper para chamar serviços
    async callService(serviceName, path, method = 'GET', authHeader = null, params = {}) {
        const service = serviceRegistry.discover(serviceName);

        const config = {
            method,
            url: `${service.url}${path}`,
            timeout: 5000
        };

        if (authHeader) {
            config.headers = { Authorization: authHeader };
        }

        if (method === 'GET' && Object.keys(params).length > 0) {
            config.params = params;
        }

        const response = await axios(config);
        return response.data;
    }

    // Health checks para serviços registrados
    startHealthChecks() {
        setInterval(async () => {
            console.log('🔍 Executando health checks automáticos...');
            const services = serviceRegistry.listServices();
            for (const [serviceName, service] of Object.entries(services)) {
                try {
                    await axios.get(`${service.url}/health`, { timeout: 5000 });
                    serviceRegistry.updateHealth(serviceName, true);
                    console.log(`✅ Serviço saudável: ${serviceName}`);
                } catch (error) {
                    serviceRegistry.updateHealth(serviceName, false);
                    console.error(`❌ Serviço com falha: ${serviceName}`);
                }
            }
        }, 30000);

        // Health check inicial
        setTimeout(async () => {
            const services = serviceRegistry.listServices();
            for (const [serviceName, service] of Object.entries(services)) {
                try {
                    await axios.get(`${service.url}/health`, { timeout: 5000 });
                    serviceRegistry.updateHealth(serviceName, true);
                } catch (error) {
                    serviceRegistry.updateHealth(serviceName, false);
                }
            }
        }, 5000);
    }

    start() {
        this.app.listen(this.port, () => {
            console.log('=====================================');
            console.log(`API Gateway iniciado na porta ${this.port}`);
            console.log(`URL: http://localhost:${this.port}`);
            console.log(`Health: http://localhost:${this.port}/health`);
            console.log(`Registry: http://localhost:${this.port}/registry`);
            console.log(`Dashboard: http://localhost:${this.port}/api/dashboard`);
            console.log(`Architecture: Microservices with NoSQL`);
            console.log('=====================================');
            console.log('Rotas disponíveis:');
            console.log('   POST /api/auth/register');
            console.log('   POST /api/auth/login');
            console.log('   GET  /api/users');
            console.log('   GET  /api/items');
            console.log('   GET  /api/lists');
            console.log('   GET  /api/search?q=termo');
            console.log('   GET  /api/dashboard');
            console.log('=====================================');
        });
    }
}

// Start gateway
if (require.main === module) {
    const gateway = new APIGateway();
    gateway.start();

    // Graceful shutdown
    process.on('SIGTERM', () => process.exit(0));
    process.on('SIGINT', () => process.exit(0));
}

module.exports = APIGateway;