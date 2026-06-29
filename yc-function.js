const apiHandler = require('./api/index');

// Адаптер для Yandex Cloud Functions
module.exports.handler = async (event, context) => {
    // Формируем req/res объекты, совместимые с Express
    const req = {
        method: event.httpMethod,
        headers: event.headers || {},
        query: event.queryStringParameters || {},
        body: event.body ? JSON.parse(event.body) : {},
        connection: { remoteAddress: event.headers['x-forwarded-for'] || 'unknown' }
    };

    let statusCode = 200;
    let responseHeaders = {};
    let responseBody = '';

    const res = {
        status: (code) => { statusCode = code; return res; },
        setHeader: (key, value) => { responseHeaders[key] = value; return res; },
        json: (data) => {
            responseBody = JSON.stringify(data);
            responseHeaders['Content-Type'] = 'application/json';
            return res;
        },
        end: () => { return res; },
        sendFile: () => { /* Для статики нужен отдельный подход, пока заглушка */ }
    };

    try {
        await apiHandler(req, res);
    } catch (e) {
        statusCode = 500;
        responseBody = JSON.stringify({ error: e.message });
    }

    return {
        statusCode,
        headers: responseHeaders,
        body: responseBody,
        isBase64Encoded: false
    };
};
