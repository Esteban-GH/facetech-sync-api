const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
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

pool.getConnection((err, connection) => {
    if (err) {
        console.error('Error conectando a MySQL desde Railway:', err.message);
    } else {
        console.log('Conexión exitosa a MySQL desde Railway');
        connection.release();
    }
});

app.get('/api/test', (req, res) => {
    res.send('Servidor funcionando correctamente');
});
aapp.post('/api/sync-persons', (req, res) => {
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

    const start = Date.now();
    pool.query(query, [personID, personName, rut, apellidos, cargo, empresa, numImages, addTime, isSynced], (err, results) => {
        console.log(`Tiempo de consulta MySQL (Persona): ${Date.now() - start} ms`);
        if (err) {
            console.error('Error insertando persona:', err.message);
            return res.status(500).json({ message: 'Error en la sincronización', status: 'error' });
        }
        // Usar el personID insertado (si MySQL lo generó) o el enviado
        const assignedPersonID = results.insertId > 0 ? results.insertId : personID;
        res.status(200).json({ 
            message: 'Persona sincronizada', 
            status: 'success', 
            personID: assignedPersonID // Devolver el personID asignado
        });
    });
});
// Endpoint para sincronizar imágenes faciales
app.post('/api/sync-face-images', (req, res) => {
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

    const start = Date.now();
    pool.query(query, [recordID, personID, personName, JSON.stringify(faceEmbedding), isSynced], (err, results) => {
        console.log(`Tiempo de consulta MySQL (Imagen Facial): ${Date.now() - start} ms`);
        if (err) {
            console.error('Error insertando imagen facial:', err.message);
            return res.status(500).json({ message: 'Error en la sincronización', status: 'error' });
        }
        res.status(200).json({ message: 'Imagen sincronizada', status: 'success' });
    });
});

// Nuevo endpoint para eliminar personas
app.post('/api/delete-person', (req, res) => {
    const { personID } = req.body;

    if (!personID || typeof personID !== 'number') {
        return res.status(400).json({ message: 'ID no proporcionado o inválido', status: 'error' });
    }

    const query = 'DELETE FROM persons WHERE personID = ?';

    const start = Date.now();
    pool.query(query, [personID], (err, results) => {
        console.log(`Tiempo de consulta MySQL (Eliminación): ${Date.now() - start} ms`);
        if (err) {
            console.error('Error eliminando persona:', err.message);
            return res.status(500).json({ message: 'Error al eliminar el registro', status: 'error' });
        }
        if (results.affectedRows > 0) {
            res.status(200).json({ message: 'Eliminación exitosa', status: 'success' });
        } else {
            res.status(404).json({ message: 'Registro no encontrado', status: 'error' });
        }
    });
});

// Iniciar el servidor con el puerto de Railway
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
});