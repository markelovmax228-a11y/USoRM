const express = require("express");
const { Pool } = require("pg"); // Перешли на PostgreSQL
const bodyParser = require("body-parser");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);

const app = express();

// Подключение к базе через переменную окружения Render
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Нужно для облачных БД
});

app.use(bodyParser.json());
app.use(express.static("public"));

// Настройка безопасного хранения сессий в БД
app.use(session({
    store: new pgSession({
        pool: pool,
        tableName: 'session' // Таблица для сессий создастся сама при первом входе
    }),
    secret: "super-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 дней
}));

// ===== ИНИЦИАЛИЗАЦИЯ ТАБЛИЦ =====
const initDB = async () => {
    // Таблица сессий (требуется для connect-pg-simple)
    await pool.query(`
        CREATE TABLE IF NOT EXISTS "session" (
          "sid" varchar NOT NULL COLLATE "default",
          "sess" json NOT NULL,
          "expire" timestamp(6) NOT NULL
        ) WITH (OIDS=FALSE);
        ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
        CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
    `).catch(() => {}); // Игнорируем ошибку, если индекс уже есть

    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            firstName TEXT,
            password TEXT,
            role TEXT,
            passportSeries INTEGER DEFAULT 118,
            passportNumber INTEGER
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS posts (
            id SERIAL PRIMARY KEY,
            content TEXT,
            author TEXT
        )
    `);

    // Создаем начальных лидеров
    const res = await pool.query("SELECT COUNT(*) FROM users");
    if (parseInt(res.rows[0].count) === 0) {
        await pool.query(`
            INSERT INTO users (firstName, password, role, passportNumber)
            VALUES ('Максим', '123', 'leader', 1), ('Роман', '123', 'leader', 2)
        `);
    }
};
initDB();

// ===== РОУТЫ (адаптированы под PG) =====

app.post("/register", async (req, res) => {
    const { firstName, password } = req.body;
    const maxRes = await pool.query("SELECT MAX(passportNumber) as max FROM users");
    let next = (maxRes.rows[0].max || 2) + 1;

    await pool.query(
        "INSERT INTO users (firstName, password, role, passportNumber) VALUES ($1, $2, 'citizen', $3)",
        [firstName, password, next]
    );
    res.json({ success: true });
});

app.post("/login", async (req, res) => {
    const { firstName, password } = req.body;
    const userRes = await pool.query(
        "SELECT * FROM users WHERE firstName=$1 AND password=$2",
        [firstName, password]
    );
    
    if (userRes.rows.length > 0) {
        req.session.user = userRes.rows[0];
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

app.get("/me", (req, res) => {
    if (!req.session.user) return res.sendStatus(401);
    res.json(req.session.user);
});

app.get("/posts", async (req, res) => {
    const posts = await pool.query("SELECT * FROM posts");
    res.json(posts.rows);
});

app.post("/posts", async (req, res) => {
    if (!req.session?.user || req.session.user.role !== "leader") {
        return res.sendStatus(403);
    }
    await pool.query("INSERT INTO posts (content, author) VALUES ($1, $2)",
        [req.body.content, req.session.user.firstName]);
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
