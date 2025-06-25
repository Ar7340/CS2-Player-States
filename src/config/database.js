import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

class DatabaseManager {
    constructor() {
        this.pool = null;
        this.config = {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT) || 3306,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME || 'cs2_stats',
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            acquireTimeout: 60000,
            timeout: 60000,
            reconnect: true
        };
    }

    async initialize() {
        try {
            this.pool = mysql.createPool(this.config);
            
            // Test connection
            const connection = await this.pool.getConnection();
            console.log('✅ Database connected successfully');
            connection.release();
            
            return true;
        } catch (error) {
            console.error('❌ Database connection failed:', error.message);
            throw error;
        }
    }

    async getConnection() {
        if (!this.pool) {
            await this.initialize();
        }
        return await this.pool.getConnection();
    }

    async execute(query, params = []) {
        const connection = await this.getConnection();
        try {
            const [results] = await connection.execute(query, params);
            return results;
        } catch (error) {
            console.error('❌ Query execution failed:', error.message);
            throw error;
        } finally {
            connection.release();
        }
    }

    async transaction(queries) {
        const connection = await this.getConnection();
        try {
            await connection.beginTransaction();
            
            const results = [];
            for (const { query, params } of queries) {
                const [result] = await connection.execute(query, params);
                results.push(result);
            }
            
            await connection.commit();
            return results;
        } catch (error) {
            await connection.rollback();
            console.error('❌ Transaction failed:', error.message);
            throw error;
        } finally {
            connection.release();
        }
    }

    async close() {
        if (this.pool) {
            await this.pool.end();
            console.log('🔒 Database connections closed');
        }
    }
}

export default new DatabaseManager();