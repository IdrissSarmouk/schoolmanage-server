const express = require('express');
const cors = require('cors');  // Importer CORS
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./config/db'); // Database connection (db.query)

const app = express();
app.use(cors());  // Ajouter le middleware CORS
app.use(express.json());

app.post('/api/signup', async (req, res) => {
  const { role, first_name, last_name, email, password, class_name, subject_name } = req.body;

  // Validate required fields
  if (!role || !first_name || !last_name || !email || !password) {
    return res.status(400).json({ error: 'Champs manquants' });
  }

  // Additional validation based on role
  if (role === 'student' && !class_name) {
    return res.status(400).json({ error: 'Classe manquante' });
  }
  
  if (role === 'teacher' && !subject_name) {
    return res.status(400).json({ error: 'Matière manquante' });
  }

  try {
    // Check email uniqueness
    const { rows: existing } = await db.query(
      'SELECT 1 FROM my_schema.users WHERE email = $1',
      [email]
    );
    if (existing.length) {
      return res.status(400).json({ error: 'Email déjà utilisé' });
    }

    // Fetch class or subject IDs
    let classId = null;
    let subjectId = null;

    if (role === 'student') {
      const { rows: classRows } = await db.query(
        'SELECT id FROM my_schema.classes WHERE name = $1',
        [class_name]
      );
      if (!classRows.length) {
        return res.status(400).json({ error: 'Classe invalide' });
      }
      classId = classRows[0].id;
    }

    if (role === 'teacher') {
      const { rows: subjRows } = await db.query(
        'SELECT id FROM my_schema.subjects WHERE name = $1',
        [subject_name]
      );
      
      if (!subjRows.length) {
        // Get available subjects for better error message
        const { rows: allSubjects } = await db.query('SELECT name FROM my_schema.subjects');
        return res.status(400).json({ 
          error: 'Matière invalide',
          availableSubjects: allSubjects.map(s => s.name)
        });
      }
      subjectId = subjRows[0].id;
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Build insert query
    let insertSQL, params;
    if (role === 'student') {
      insertSQL = `
        INSERT INTO my_schema.users
          (first_name, last_name, email, password_hash, role, class_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, first_name, last_name, email, role
      `;
      params = [first_name, last_name, email, password_hash, 'student', classId];
    } else if (role === 'teacher') {
      insertSQL = `
        INSERT INTO my_schema.users
          (first_name, last_name, email, password_hash, role, subject_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, first_name, last_name, email, role
      `;
      params = [first_name, last_name, email, password_hash, 'teacher', subjectId];
    } else if (role === 'admin') {
      insertSQL = `
        INSERT INTO my_schema.users
          (first_name, last_name, email, password_hash, role)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, first_name, last_name, email, role
      `;
      params = [first_name, last_name, email, password_hash, 'admin'];
    } else {
      return res.status(400).json({ error: 'Rôle invalide' });
    }

    const { rows } = await db.query(insertSQL, params);

    // Return just the user data without token
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error in /api/signup:', err);
    res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
});


app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  // Validate required fields
  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' });
  }

  try {
    // Find user by email
    const { rows } = await db.query(
      'SELECT * FROM my_schema.users WHERE email = $1',
      [email]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Email ou mot de passe invalide' });
    }

    const user = rows[0];

    // Compare passwords
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Email ou mot de passe invalide' });
    }

    // Create JWT payload (minimal info)
    const payload = {
      id: user.id,
      role: user.role,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name
    };

    // Generate JWT
    const token = jwt.sign(payload, '31214141241241', { expiresIn: '1h' });

    // Return token and user info
    res.json({
      message: 'Connexion réussie',
      token,
      user: payload
    });

  } catch (err) {
    console.error('Error in /api/login:', err);
    res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
});


app.get('/api/teachers/count', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT COUNT(*) as total FROM my_schema.users WHERE role = $1',
      ['teacher']
    );
    
    res.json({
      total_teachers: parseInt(rows[0].total, 10)
    });
  } catch (err) {
    console.error('Error in /api/teachers/count:', err);
    res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
});


app.get('/api/student/count', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT COUNT(*) as total FROM my_schema.users WHERE role = $1',
      ['student']
    );
    
    res.json({
      total_students: parseInt(rows[0].total, 10)
    });
  } catch (err) {
    console.error('Error in /api/student/count:', err);
    res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
});

app.get('/api/classes/count', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT COUNT(*) as total FROM my_schema.classes'
    );
    
    res.json({
      total_classes: parseInt(rows[0].total, 10)
    });
  } catch (err) {
    console.error('Error in /api/classes/count:', err);
    res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
});

app.get('/api/accounts/count', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT COUNT(*) as total FROM my_schema.users'
    );
    
    res.json({
      total_accounts: parseInt(rows[0].total, 10)
    });
  } catch (err) {
    console.error('Error in /api/accounts/count:', err);
    res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
});

// Ajoutons d'abord les nouvelles routes API dans le serveur

app.get('/api/students/by-class', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT c.name as class_name, COUNT(u.id) as student_count
      FROM my_schema.users u
      JOIN my_schema.classes c ON u.class_id = c.id
      WHERE u.role = 'student'
      GROUP BY c.name
      ORDER BY c.name
    `);
    
    res.json(rows);
  } catch (err) {
    console.error('Error in /api/students/by-class:', err);
    res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
});

app.get('/api/teachers/by-subject', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT s.name as subject_name, COUNT(u.id) as teacher_count
      FROM my_schema.users u
      JOIN my_schema.subjects s ON u.subject_id = s.id
      WHERE u.role = 'teacher'
      GROUP BY s.name
      ORDER BY teacher_count DESC
    `);
    
    res.json(rows);
  } catch (err) {
    console.error('Error in /api/teachers/by-subject:', err);
    res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
});


app.post('/api/teachers', async (req, res) => {
  const { first_name, last_name, email, password, subject_name, class_names } = req.body;

  if (!first_name || !last_name || !email || !password || !subject_name || !class_names) {
    return res.status(400).json({ error: 'Champs manquants' });
  }

  try {
    const { rows: subjRows } = await db.query('SELECT id FROM my_schema.subjects WHERE name = $1', [subject_name]);
    if (!subjRows.length) return res.status(400).json({ error: 'Matière invalide' });
    const subjectId = subjRows[0].id;

    const { rows: existing } = await db.query('SELECT 1 FROM my_schema.users WHERE email = $1', [email]);
    if (existing.length) return res.status(400).json({ error: 'Email déjà utilisé' });

    const password_hash = await bcrypt.hash(password, 10);

    const { rows: teacherRows } = await db.query(`
      INSERT INTO my_schema.users (first_name, last_name, email, password_hash, role, subject_id)
      VALUES ($1, $2, $3, $4, 'teacher', $5) RETURNING id
    `, [first_name, last_name, email, password_hash, subjectId]);
    const teacherId = teacherRows[0].id;

    for (const className of class_names) {
      const { rows: classRows } = await db.query('SELECT id FROM my_schema.classes WHERE name = $1', [className]);
      if (!classRows.length) continue;
      await db.query('INSERT INTO my_schema.teacher_classes (teacher_id, class_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [teacherId, classRows[0].id]);
    }

    res.status(201).json({ message: 'Enseignant créé', teacher_id: teacherId });
  } catch (err) {
    console.error('Error in /api/teachers:', err);
    res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
});


app.get('/api/teachers', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT u.id, u.first_name, u.last_name, s.name AS subject, 
        ARRAY_AGG(c.name) AS classes
      FROM my_schema.users u
      JOIN my_schema.subjects s ON u.subject_id = s.id
      LEFT JOIN my_schema.teacher_classes tc ON u.id = tc.teacher_id
      LEFT JOIN my_schema.classes c ON tc.class_id = c.id
      WHERE u.role = 'teacher'
      GROUP BY u.id, s.name
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error in GET /api/teachers:', err);
    res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
});


app.put('/api/teachers/:id', async (req, res) => {
  const teacherId = req.params.id;
  const { first_name, last_name, email, subject_name, class_names } = req.body;

  try {
    if (subject_name) {
      const { rows: subjRows } = await db.query('SELECT id FROM my_schema.subjects WHERE name = $1', [subject_name]);
      if (!subjRows.length) return res.status(400).json({ error: 'Matière invalide' });
      await db.query('UPDATE my_schema.users SET subject_id = $1 WHERE id = $2', [subjRows[0].id, teacherId]);
    }

    if (first_name) await db.query('UPDATE my_schema.users SET first_name = $1 WHERE id = $2', [first_name, teacherId]);
    if (last_name) await db.query('UPDATE my_schema.users SET last_name = $1 WHERE id = $2', [last_name, teacherId]);
    if (email) await db.query('UPDATE my_schema.users SET email = $1 WHERE id = $2', [email, teacherId]);

    if (class_names) {
      await db.query('DELETE FROM my_schema.teacher_classes WHERE teacher_id = $1', [teacherId]);
      for (const className of class_names) {
        const { rows: classRows } = await db.query('SELECT id FROM my_schema.classes WHERE name = $1', [className]);
        if (classRows.length) {
          await db.query('INSERT INTO my_schema.teacher_classes (teacher_id, class_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [teacherId, classRows[0].id]);
        }
      }
    }

    res.json({ message: 'Enseignant mis à jour' });
  } catch (err) {
    console.error('Error in PUT /api/teachers/:id:', err);
    res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
});


app.delete('/api/teachers/:id', async (req, res) => {
  const teacherId = req.params.id;

  try {
    await db.query('DELETE FROM my_schema.users WHERE id = $1 AND role = $2', [teacherId, 'teacher']);
    res.json({ message: 'Enseignant supprimé' });
  } catch (err) {
    console.error('Error in DELETE /api/teachers/:id:', err);
    res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
});


// 404 handler
app.use((req, res) => res.status(404).json({ error: 'Not Found' }));

// Error handler for JSON parse errors
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON invalide' });
  }
  next(err);
});

// 404 handler
app.use((req, res) => res.status(404).json({ error: 'Not Found' }));

// Error handler for JSON parse errors
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON invalide' });
  }
  next(err);
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
