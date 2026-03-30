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
db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    firstName TEXT,
    lastName TEXT,
    password TEXT,
    passportSeries INTEGER DEFAULT 118,
    passportNumber INTEGER,
    role TEXT
)`);

db.run(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    authorId INTEGER
)`);

db.run(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT
)`);

// ===== РЕГИСТРАЦИЯ =====
app.post("/register", (req, res) => {
    const { firstName, lastName, password } = req.body;

    db.get("SELECT MAX(passportNumber) as max FROM users", (err, row) => {
        let nextNumber = row.max ? row.max + 1 : 3;

        db.get("SELECT COUNT(*) as count FROM users", (err, countRow) => {
            let role = countRow.count < 2 ? "leader" : "citizen";

            db.run(`INSERT INTO users 
                (firstName, lastName, password, passportNumber, role)
                VALUES (?, ?, ?, ?, ?)`,
                [firstName, lastName, password, nextNumber, role],
                function () {
                    res.json({ success: true });
                });
        });
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
    db.all(`SELECT posts.*, users.firstName 
            FROM posts 
            JOIN users ON posts.authorId = users.id`,
        (err, rows) => {
            res.json(rows);
        });
});

app.post("/posts", (req, res) => {
    if (!req.session.user) return res.sendStatus(403);

    if (req.session.user.role !== "leader") {
        return res.sendStatus(403);
    }

    const content = req.body.content;
    const author = req.session.user.firstName;

    db.run(
        "INSERT INTO posts (content, authorId) VALUES (?, ?)",
        [content, req.session.user.id]
    );

    const text = `Глава страны ${author} выступил с новостью`;

    db.run("INSERT INTO notifications (text) VALUES (?)", [text]);

    res.json({ success: true });
});

// ===== УВЕДОМЛЕНИЯ =====
app.get("/notifications", (req, res) => {
    db.all("SELECT * FROM notifications ORDER BY id DESC LIMIT 5", (err, rows) => {
        res.json(rows);
    });
});

app.listen(3000, () => console.log("Server running"));