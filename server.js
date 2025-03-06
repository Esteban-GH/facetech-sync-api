const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise'); // Usar la versión promisificada
const cors = require('cors');

const app = express();
app.use(bodyParser.json({ limit: '10mb' }));
app.use(cors());

const pool = mysql.createPool({
    host: 'nozomi.proxy.rlwy.net',
    port: 14759,
    user: 'root',
    password: 'nUyVieIUvDBKsKxKGJNxCYkKtNukdJBa',
    database: 'railway',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Verificar conexión a la base de datos al iniciar
pool.getConnection()
    .then(connection => {
        console.log('Conexión exitosa a MySQL desde Railway');
        connection.release();
    })
    .catch(err => {
        console.error('Error conectando a MySQL desde Railway:', err.message);
    });

app.get('/api/test', (req, res) => {
    res.send('Servidor funcionando correctamente');
});

app.post('/api/sync-persons', async (req, res) => { // Corregido a app.post
    const person = req.body;

    if (!person || typeof person.personID !== 'number') {
        return res.status(400).json({ message: 'Datos de persona no válidos', status: 'error' });
    }

    const { personID, personName, rut, apellidos, cargo, empresa, numImages, addTime, isSynced } = person;

    const query = `
        INSERT INTO persons (personID, personName, rut, apellidos, cargo, empresa, numImages, addTime, isSynced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
        personName = VALUES(personName),
        rut = VALUES(rut),
        apellidos = VALUES(apellidos),
        cargo = VALUES(cargo),
        empresa = VALUES(empresa),
        numImages = VALUES(numImages),
        addTime = VALUES(addTime),
        isSynced = VALUES(isSynced)
    `;

    try {
        const start = Date.now();
        const [results] = await pool.query(query, [personID, personName, rut, apellidos, cargo, empresa, numImages, addTime, isSynced]);
        console.log(`Tiempo de consulta MySQL (Persona): ${Date.now() - start} ms`);
        const assignedPersonID = results.insertId > 0 ? results.insertId : personID;
        res.status(200).json({ 
            message: 'Persona sincronizada', 
            status: 'success', 
            personID: assignedPersonID 
        });
    } catch (err) {
        console.error('Error insertando persona:', err.message);
        res.status(500).json({ message: 'Error en la sincronización', status: 'error' });
    }
});

app.post('/api/sync-face-images', async (req, res) => {
    const faceImage = req.body;

    if (!faceImage || typeof faceImage.recordID !== 'number') {
        return res.status(400).json({ message: 'Datos de imagen facial no válidos', status: 'error' });
    }

    const { recordID, personID, personName, faceEmbedding, isSynced } = faceImage;

    const query = `
        INSERT INTO face_images (recordID, personID, personName, faceEmbedding, isSynced)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
        personName = VALUES(personName),
        faceEmbedding = VALUES(faceEmbedding),
        isSynced = VALUES(isSynced)
    `;

    try {
        const start = Date.now();
        const [results] = await pool.query(query, [recordID, personID, personName, JSON.stringify(faceEmbedding), isSynced]);
        console.log(`Tiempo de consulta MySQL (Imagen Facial): ${Date.now() - start} ms`);
        res.status(200).json({ message: 'Imagen sincronizada', status: 'success' });
    } catch (err) {
        console.error('Error insertando imagen facial:', err.message);
        res.status(500).json({ message: 'Error en la sincronización', status: 'error' });
    }
});

app.post('/api/delete-person', async (req, res) => {
    const { personID } = req.body;

    if (!personID || typeof personID !== 'number') {
        return res.status(400).json({ message: 'ID no proporcionado o inválido', status: 'error' });
    }

    const query = 'DELETE FROM persons WHERE personID = ?';

    try {
        const start = Date.now();
        const [results] = await pool.query(query, [personID]);
        console.log(`Tiempo de consulta MySQL (Eliminación): ${Date.now() - start} ms`);
        if (results.affectedRows > 0) {
            res.status(200).json({ message: 'Eliminación exitosa', status: 'success' });
        } else {
            res.status(404).json({ message: 'Registro no encontrado', status: 'error' });
        }
    } catch (err) {
        console.error('Error eliminando persona:', err.message);
        res.status(500).json({ message: 'Error al eliminar el registro', status: 'error' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
});