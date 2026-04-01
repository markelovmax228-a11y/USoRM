const express = require("express");
const { Pool } = require("pg");
const bodyParser = require("body-parser");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const path = require("path");

const app = express();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.use(bodyParser.json());
app.use(express.static("public"));

app.use(session({
    store: new pgSession({
        pool: pool,
        tableName: 'session'
    }),
    secret: "super-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }
}));

// ===== ИНИЦИАЛИЗАЦИЯ ТАБЛИЦ =====
const initDB = async () => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS "session" (
          "sid" varchar NOT NULL COLLATE "default",
          "sess" json NOT NULL,
          "expire" timestamp(6) NOT NULL
        ) WITH (OIDS=FALSE);
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_pkey') THEN
            ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid");
        END IF;
        CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
    `).catch(() => {});

    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            firstName TEXT,
            lastName TEXT,
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

    const res = await pool.query("SELECT COUNT(*) FROM users");
    if (parseInt(res.rows[0].count) === 0) {
        await pool.query(`
            INSERT INTO users (firstName, password, role, passportNumber)
            VALUES ('Максим', '123', 'leader', 1), ('Роман', '123', 'leader', 2)
        `);
    }
};
initDB();

// ===== РОУТЫ =====

app.post("/register", async (req, res) => {
    const { firstName, lastName, password } = req.body;
    try {
        const maxRes = await pool.query("SELECT MAX(passportNumber) as max FROM users");
        let nextNumber = (maxRes.rows[0].max || 2) + 1;

        await pool.query(
            "INSERT INTO users (firstName, lastName, password, role, passportSeries, passportNumber) VALUES ($1, $2, $3, 'citizen', 118, $4)",
            [firstName, lastName, password, nextNumber]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.post("/login", async (req, res) => {
    const { firstName, password } = req.body;
    try {
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
    } catch (err) {
        res.status(500).json({ success: false });
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
        [req.body.content, req.session.user.firstname || req.session.user.firstName]);
    res.json({ success: true });
});

app.get("/logout", (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.delete("/posts/:id", async (req, res) => {
    if (!req.session.user || req.session.user.role !== "leader") {
        return res.status(403).json({ error: "Нет прав" });
    }
    await pool.query("DELETE FROM posts WHERE id = $1", [req.params.id]);
    res.json({ success: true });
});

// ===== ОБРАБОТКА 404 (В САМОМ КОНЦЕ) =====
app.use((req, res) => {
    // Отправляем файл ошибки, если путь не найден
    res.status(404).sendFile(path.join(__dirname, 'public', 'nfUSoRM.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
