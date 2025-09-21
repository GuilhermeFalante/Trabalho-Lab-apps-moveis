const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Importar banco NoSQL e service registry
const JsonDatabase = require('../../shared/JsonDatabase');
const serviceRegistry = require('../../shared/serviceRegistry');

class UserService {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3001;
        this.serviceName = 'user-service';
        this.serviceUrl = `http://localhost:${this.port}`;

        this.setupDatabase();
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
        this.seedInitialData();
    }

    setupDatabase() {
        const dbPath = path.join(__dirname, 'database');
        this.usersDb = new JsonDatabase(dbPath, 'users');
        console.log('User Service: Banco NoSQL inicializado');
    }

    async seedInitialData() {
        setTimeout(async () => {
            try {
                const existingUsers = await this.usersDb.find();

                if (existingUsers.length === 0) {
                    const adminPassword = await bcrypt.hash('admin123', 12);

                    await this.usersDb.create({
                        id: uuidv4(),
                        email: 'admin@microservices.com',
                        username: 'admin',
                        password: adminPassword,
                        firstName: 'Administrador',
                        lastName: 'Sistema',
                        role: 'admin',
                        status: 'active'
                    });

                    console.log('Usuário administrador criado (admin@microservices.com / admin123)');
                }
            } catch (error) {
                console.error('Erro ao criar dados iniciais:', error);
            }
        }, 1000);
    }

    setupMiddleware() {
        this.app.use(helmet());
        this.app.use(cors());
        this.app.use(morgan('combined'));
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));

        // Service info headers
        this.app.use((req, res, next) => {
            res.setHeader('X-Service', this.serviceName);
            res.setHeader('X-Service-Version', '1.0.0');
            res.setHeader('X-Database', 'JSON-NoSQL');
            next();
        });
    }

    setupRoutes() {
        // Health check
        this.app.get('/health', async (req, res) => {
            try {
                const userCount = await this.usersDb.count();
                res.json({
                    service: this.serviceName,
                    status: 'healthy',
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime(),
                    version: '1.0.0',
                    database: {
                        type: 'JSON-NoSQL',
                        userCount: userCount
                    }
                });
            } catch (error) {
                res.status(503).json({
                    service: this.serviceName,
                    status: 'unhealthy',
                    error: error.message
                });
            }
        });

        // Service info
        this.app.get('/', (req, res) => {
            res.json({
                service: 'User Service',
                version: '1.0.0',
                description: 'Microsserviço para gerenciamento de usuários com NoSQL',
                database: 'JSON-NoSQL',
                endpoints: [
                    'POST /auth/register',
                    'POST /auth/login',
                    'POST /auth/validate',
                    'GET /users',
                    'GET /users/:id',
                    'PUT /users/:id',
                    'GET /search'
                ]
            });
        });

        // Auth routes
        this.app.post('/auth/register', this.register.bind(this));
        this.app.post('/auth/login', this.login.bind(this));
        this.app.post('/auth/validate', this.validateToken.bind(this));

        // User routes (protected)
        this.app.get('/users', this.authMiddleware.bind(this), this.getUsers.bind(this));
        this.app.get('/users/:id', this.authMiddleware.bind(this), this.getUser.bind(this));
        this.app.put('/users/:id', this.authMiddleware.bind(this), this.updateUser.bind(this));

        // Search route
        this.app.get('/search', this.authMiddleware.bind(this), this.searchUsers.bind(this));
    }

    setupErrorHandling() {
        this.app.use('*', (req, res) => {
            res.status(404).json({
                success: false,
                message: 'Endpoint não encontrado',
                service: this.serviceName
            });
        });

        this.app.use((error, req, res, next) => {
            console.error('User Service Error:', error);
            res.status(500).json({
                success: false,
                message: 'Erro interno do serviço',
                service: this.serviceName
            });
        });
    }

    // Auth middleware
    authMiddleware(req, res, next) {
        const authHeader = req.header('Authorization');

        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Token obrigatório'
            });
        }

        const token = authHeader.replace('Bearer ', '');

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'user-secret');
            req.user = decoded;
            next();
        } catch (error) {
            res.status(401).json({
                success: false,
                message: 'Token inválido'
            });
        }
    }

    // Register user
    async register(req, res) {
        try {
            const { email, username, password, firstName, lastName, preferences } = req.body;

            // Validate required fields
            if (!email || !username || !password) {
                return res.status(400).json({ message: 'Email, username, and password are required.' });
            }

            // Check if email is unique
            const isUnique = await this.isEmailUnique(email);
            if (!isUnique) {
                return res.status(400).json({ message: 'Email is already in use.' });
            }

            // Hash the password
            const hashedPassword = await bcrypt.hash(password, 12);

            // Create user object
            const newUser = {
                id: uuidv4(),
                email,
                username,
                password: hashedPassword,
                firstName,
                lastName,
                preferences: preferences || {},
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            // Validate schema
            this.validateUserSchema(newUser);

            // Save user to database
            await this.usersDb.create(newUser);

            res.status(201).json({ message: 'User registered successfully.', userId: newUser.id });
        } catch (error) {
            console.error('Error in register:', error);
            res.status(500).json({ message: 'Internal server error.' });
        }
    }

    // Login user
    async login(req, res) {
        try {
            const { email, username, password } = req.body;

            // Validate required fields
            if ((!email && !username) || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'É necessário fornecer um identificador (email ou username) e a senha.'
                });
            }

            // Find user by email or username
            const users = await this.usersDb.find();
            const user = users.find(u => (email && u.email === email) || (username && u.username === username));

            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: 'Usuário não encontrado.'
                });
            }

            // Compare passwords
            const isPasswordValid = await bcrypt.compare(password, user.password);
            if (!isPasswordValid) {
                return res.status(401).json({
                    success: false,
                    message: 'Senha inválida.'
                });
            }

            const token = jwt.sign(
                { id: user.id, email: user.email, username: user.username },
                process.env.JWT_SECRET || 'user-secret',
                { expiresIn: '24h' }
            );

            res.status(200).json({
                success: true,
                message: 'Login bem-sucedido.',
                token
            });
        } catch (error) {
            console.error('Error in login:', error);
            res.status(500).json({
                success: false,
                message: 'Erro interno do servidor.'
            });
        }
    }

    // Validate token
    async validateToken(req, res) {
        try {
            const { token } = req.body;

            if (!token) {
                return res.status(400).json({
                    success: false,
                    message: 'Token obrigatório'
                });
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'user-secret');
            const user = await this.usersDb.findById(decoded.id);

            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: 'Usuário não encontrado'
                });
            }

            const { password: _, ...userWithoutPassword } = user;

            res.json({
                success: true,
                message: 'Token válido',
                data: { user: userWithoutPassword }
            });
        } catch (error) {
            res.status(401).json({
                success: false,
                message: 'Token inválido'
            });
        }
    }

    // Get users 
    async getUsers(req, res) {
        try {
            const { page = 1, limit = 10, role, status } = req.query;
            const skip = (page - 1) * parseInt(limit);

            const filter = {};
            if (role) filter.role = role;
            if (status) filter.status = status;

            const users = await this.usersDb.find(filter, {
                skip: skip,
                limit: parseInt(limit),
                sort: { createdAt: -1 }
            });

            const safeUsers = users.map(user => {
                const { password, ...safeUser } = user;
                return safeUser;
            });

            const total = await this.usersDb.count(filter);

            res.json({
                success: true,
                data: safeUsers,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            });
        } catch (error) {
            console.error('Erro ao buscar usuários:', error);
            res.status(500).json({
                success: false,
                message: 'Erro interno do servidor'
            });
        }
    }

    // Get user by ID
    async getUser(req, res) {
        try {
            const { id } = req.params;
            const user = await this.usersDb.findById(id);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'Usuário não encontrado'
                });
            }

            if (req.user.id !== id && req.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Acesso negado'
                });
            }

            const { password, ...userWithoutPassword } = user;

            res.json({
                success: true,
                data: userWithoutPassword
            });
        } catch (error) {
            console.error('Erro ao buscar usuário:', error);
            res.status(500).json({
                success: false,
                message: 'Erro interno do servidor'
            });
        }
    }

    // Update user 
    async updateUser(req, res) {
        try {
            const { id } = req.params;
            const { firstName, lastName, email, bio, theme, language } = req.body;

            if (req.user.id !== id && req.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Acesso negado'
                });
            }

            const user = await this.usersDb.findById(id);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'Usuário não encontrado'
                });
            }

            const updates = {};
            if (firstName) updates.firstName = firstName;
            if (lastName) updates.lastName = lastName;
            if (email) updates.email = email.toLowerCase();

            if (bio !== undefined) updates['profile.bio'] = bio;
            if (theme) updates['profile.preferences.theme'] = theme;
            if (language) updates['profile.preferences.language'] = language;

            const updatedUser = await this.usersDb.update(id, updates);
            const { password, ...userWithoutPassword } = updatedUser;

            res.json({
                success: true,
                message: 'Usuário atualizado com sucesso',
                data: userWithoutPassword
            });
        } catch (error) {
            console.error('Erro ao atualizar usuário:', error);
            res.status(500).json({
                success: false,
                message: 'Erro interno do servidor'
            });
        }
    }
    async searchUsers(req, res) {
        try {
            const { q, limit = 10 } = req.query;

            if (!q) {
                return res.status(400).json({
                    success: false,
                    message: 'Parâmetro de busca "q" é obrigatório'
                });
            }

            const users = await this.usersDb.search(q, ['firstName', 'lastName', 'username', 'email']);

            const safeUsers = users
                .filter(user => user.status === 'active')
                .slice(0, parseInt(limit))
                .map(user => {
                    const { password, ...safeUser } = user;
                    return safeUser;
                });

            res.json({
                success: true,
                data: {
                    query: q,
                    results: safeUsers,
                    total: safeUsers.length
                }
            });
        } catch (error) {
            console.error('Erro na busca de usuários:', error);
            res.status(500).json({
                success: false,
                message: 'Erro interno do servidor'
            });
        }
    }

    registerWithRegistry() {
        serviceRegistry.register(this.serviceName, {
            url: this.serviceUrl,
            version: '1.0.0',
            database: 'JSON-NoSQL',
            endpoints: ['/health', '/auth/register', '/auth/login', '/users', '/search']
        });
    }

    startHealthReporting() {
        setInterval(() => {
            serviceRegistry.updateHealth(this.serviceName, true);
        }, 30000);
    }

    start() {
        this.app.listen(this.port, () => {
            console.log('=====================================');
            console.log(`User Service iniciado na porta ${this.port}`);
            console.log(`URL: ${this.serviceUrl}`);
            console.log(`Health: ${this.serviceUrl}/health`);
            console.log(`Database: JSON-NoSQL`);
            console.log('=====================================');

            this.registerWithRegistry();
            this.startHealthReporting();
        });
    }

    validateUserSchema(user) {
        const schema = {
            id: 'string',
            email: 'string',
            username: 'string',
            password: 'string',
            firstName: 'string',
            lastName: 'string',
            preferences: {
                defaultStore: 'string',
                currency: 'string'
            },
            createdAt: 'number',
            updatedAt: 'number'
        };

        for (const key in schema) {
            if (typeof user[key] !== schema[key] && !(key in user)) {
                throw new Error(`Invalid or missing field: ${key}`);
            }
        }
    }

    async isEmailUnique(email) {
        const users = await this.usersDb.find();
        return !users.some(user => user.email === email);
    }
}

// Start service
if (require.main === module) {
    const userService = new UserService();
    userService.start();

    // Graceful shutdown
    process.on('SIGTERM', () => {
        serviceRegistry.unregister('user-service');
        process.exit(0);
    });
    process.on('SIGINT', () => {
        serviceRegistry.unregister('user-service');
        process.exit(0);
    });
}

module.exports = UserService;