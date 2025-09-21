const axios = require('axios');

const API_URL = 'http://localhost:3000';

async function main() {
	try {
		// 1. Registro de usuário
		console.log('--- Registro de usuário ---');
		const registerRes = await axios.post(`${API_URL}/api/auth/register`, {
			email: 'demo@email.com',
			username: 'demouser',
			password: 'senha123',
			firstName: 'Demo',
			lastName: 'User'
		});
		console.log('Usuário registrado:', registerRes.data);

		// 2. Login
		console.log('\n--- Login ---');
		const loginRes = await axios.post(`${API_URL}/api/auth/login`, {
			email: 'demo@email.com',
			password: 'senha123'
		});
		const token = loginRes.data.token;
		console.log('Token JWT:', token);

		// 3. Busca de itens
		console.log('\n--- Busca de itens---');
		const searchRes = await axios.get(`${API_URL}/api/items`);
		const items = searchRes.data;
		console.log('Itens encontrados:', items.map(i => ({ id: i.id, name: i.name })));
		if (!items.length) throw new Error('Nenhum item encontrado.');
		const itemId = items[0].id;

		// 4. Criação de lista
		console.log('\n--- Criação de lista ---');
		const listRes = await axios.post(`${API_URL}/api/lists`, {
			name: 'Minha Lista de Compras',
			description: 'Lista criada via demo',
			status: 'active'
		}, {
			headers: { Authorization: `Bearer ${token}` }
		});
		const list = listRes.data;
		console.log('Lista criada:', { id: list.id, name: list.name });

		// 5. Adição de item à lista
		console.log('\n--- Adição de item à lista ---');
		const addItemRes = await axios.post(`${API_URL}/api/lists/${list.id}/items`, {
			itemId,
			quantity: 2,
			unit: 'kg',
			notes: 'Comprar para o mês'
		}, {
			headers: { Authorization: `Bearer ${token}` }
		});
		console.log('Lista após adição de item:', addItemRes.data.items.map(i => ({ itemName: i.itemName, quantity: i.quantity })));

		// 6. Visualização do dashboard
		console.log('\n--- Dashboard ---');
		const dashRes = await axios.get(`${API_URL}/api/dashboard`, {
			headers: { Authorization: `Bearer ${token}` }
		});
		console.log('Dashboard:', dashRes.data.data);

		console.log('\nFluxo demo concluído com sucesso!');
	} catch (err) {
		if (err.response) {
			console.error('Erro:', err.response.data);
		} else {
			console.error('Erro:', err.message);
		}
	}
}

main();
	