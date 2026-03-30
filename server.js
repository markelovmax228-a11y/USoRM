const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const session = require("express-session");

const app = express();
const db = new sqlite3.Database("./database.db");

app.use(bodyParser.json());
app.use(express.static("public"));

app.use(session({
    secret: "secret",
    resave: false,
    saveUninitialized: true
}));

// ===== БАЗА =====
db.serialize(() => {

    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        firstName TEXT,
        password TEXT,
        role TEXT,
        passportSeries INTEGER DEFAULT 118,
        passportNumber INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT,
        author TEXT
    )`);

    // 👉 создаём 2 глав автоматически
    db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
        if (row.count === 0) {
            db.run(`INSERT INTO users 
                (firstName, password, role, passportNumber)
                VALUES 
                ("Максим", "123", "leader", 1),
                ("Роман", "123", "leader", 2)
            `);
        }
    });
});

// ===== РЕГИСТРАЦИЯ =====
app.post("/register", (req, res) => {
    const { firstName, password } = req.body;

    db.get("SELECT MAX(passportNumber) as max FROM users", (err, row) => {
        let next = row.max ? row.max + 1 : 3;

        db.run(`INSERT INTO users 
            (firstName, password, role, passportNumber)
            VALUES (?, ?, "citizen", ?)`,
            [firstName, password, next],
            () => res.json({ success: true })
        );
    });
});

// ===== ЛОГИН =====
app.post("/login", (req, res) => {
    const { firstName, password } = req.body;

    db.get(`SELECT * FROM users WHERE firstName=? AND password=?`,
        [firstName, password],
        (err, user) => {
            if (user) {
                req.session.user = user;
                res.json({ success: true });
            } else {
                res.json({ success: false });
            }
        });
});

// ===== ПРОФИЛЬ =====
app.get("/me", (req, res) => {
    if (!req.session.user) return res.sendStatus(401);
    res.json(req.session.user);
});

// ===== ПОСТЫ =====
app.get("/posts", (req, res) => {
    db.all("SELECT * FROM posts", (err, rows) => {
        res.json(rows);
    });
});

app.post("/posts", (req, res) => {
    if (!req.session.user) return res.sendStatus(403);

    if (req.session.user.role !== "leader") {
        return res.sendStatus(403);
    }

    db.run("INSERT INTO posts (content, author) VALUES (?, ?)",
        [req.body.content, req.session.user.firstName]);

    res.json({ success: true });
});

app.listen(3000, () => console.log("Server running"));