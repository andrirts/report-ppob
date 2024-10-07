const { createConnection } = require('mysql2/promise');

const connection = async () => {
    try {
        const connection = await createConnection({
            user: 'RTS',
            host: '110.239.90.35',
            database: 'avr',
            password: 'RTS@0808',
            port: 3308
        });
        return connection;
    } catch (err) {
        console.log(err.message)
    }
}

module.exports = connection