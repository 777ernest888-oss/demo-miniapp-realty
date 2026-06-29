const express = require('express');
const path = require('path');
const apiHandler = require('./api/index');

const app = express();

// Middleware для парсинга JSON и URL-encoded данных
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Отдаем статические файлы (index.html, app.js, и т.д.)
app.use(express.static(path.join(__dirname, '/')));

// Все запросы к /api обрабатываем через наш API
app.all('/api', (req, res) => {
    apiHandler(req, res);
});

// Корневой маршрут - отдаем index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Запускаем сервер
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
