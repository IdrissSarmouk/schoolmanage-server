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


app.get('/api/teachers/:id/classes', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await db.query(`
      SELECT c.id, c.name
      FROM my_schema.classes c
      JOIN my_schema.teacher_classes tc ON c.id = tc.class_id
      WHERE tc.teacher_id = $1
    `, [id]);
    res.json(rows);
  } catch (err) {
    console.error('Error in GET /api/teachers/:id/classes:', err);
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

app.get('/api/subjects', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM my_schema.subjects');
    res.json(rows);
  } catch (err) {
    console.error('Error in GET /api/subjects:', err);
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});


app.get('/api/teachers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await db.query(`
      SELECT u.id, u.first_name, u.last_name, u.subject_id
      FROM my_schema.users u
      WHERE u.id = $1 AND u.role = 'teacher'
    `, [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Error in GET /api/teachers/:id:', err);
    res.status(500).json({ error: 'Server error', message: err.message });
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


app.get('/api/students', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT u.id, u.first_name, u.last_name, u.email, c.name AS class_name
      FROM my_schema.users u
      LEFT JOIN my_schema.classes c ON u.class_id = c.id
      WHERE u.role = 'student'
      ORDER BY u.id
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error in GET /api/students:', err);
    res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
});

app.post('/api/students', async (req, res) => {
  const { first_name, last_name, email, password, class_name } = req.body;

  if (!first_name || !last_name || !email || !password || !class_name) {
    return res.status(400).json({ error: 'Champs manquants' });
  }

  try {
    const { rows: classRows } = await db.query(
      'SELECT id FROM my_schema.classes WHERE name = $1',
      [class_name]
    );
    if (!classRows.length) {
      return res.status(400).json({ error: 'Classe invalide' });
    }

    const classId = classRows[0].id;
    const password_hash = await bcrypt.hash(password, 10);

    const { rows } = await db.query(`
      INSERT INTO my_schema.users 
        (first_name, last_name, email, password_hash, role, class_id)
      VALUES ($1, $2, $3, $4, 'student', $5)
      RETURNING id, first_name, last_name, email, class_id
    `, [first_name, last_name, email, password_hash, classId]);

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Error in POST /api/students:', err);
    res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
});

app.put('/api/students/:id', async (req, res) => {
  const studentId = req.params.id;
  const { first_name, last_name, email, class_name } = req.body;

  try {
    let classId = null;
    if (class_name) {
      const { rows: classRows } = await db.query(
        'SELECT id FROM my_schema.classes WHERE name = $1',
        [class_name]
      );
      if (!classRows.length) {
        return res.status(400).json({ error: 'Classe invalide' });
      }
      classId = classRows[0].id;
    }

    const { rowCount } = await db.query(`
      UPDATE my_schema.users
      SET first_name = COALESCE($1, first_name),
          last_name = COALESCE($2, last_name),
          email = COALESCE($3, email),
          class_id = COALESCE($4, class_id),
          updated_at = NOW()
      WHERE id = $5 AND role = 'student'
    `, [first_name, last_name, email, classId, studentId]);

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Élève non trouvé' });
    }

    res.json({ message: 'Élève mis à jour avec succès' });
  } catch (err) {
    console.error('Error in PUT /api/students/:id:', err);
    res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
});

app.delete('/api/students/:id', async (req, res) => {
  const studentId = req.params.id;

  try {
    const { rowCount } = await db.query(`
      DELETE FROM my_schema.users 
      WHERE id = $1 AND role = 'student'
    `, [studentId]);

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Élève non trouvé' });
    }

    res.json({ message: 'Élève supprimé avec succès' });
  } catch (err) {
    console.error('Error in DELETE /api/students/:id:', err);
    res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
});


app.get('/api/teachers/:id/classes/count', async (req, res) => {
  const teacherId = req.params.id;
  
  try {
    // Vérifier d'abord que l'utilisateur est bien un enseignant
    const { rows: teacherCheck } = await db.query(
      'SELECT 1 FROM my_schema.users WHERE id = $1 AND role = $2',
      [teacherId, 'teacher']
    );
    
    if (!teacherCheck.length) {
      return res.status(404).json({ error: 'Enseignant non trouvé' });
    }
    
    // Compter le nombre de classes attribuées à cet enseignant
    const { rows } = await db.query(`
      SELECT COUNT(*) as class_count
      FROM my_schema.teacher_classes
      WHERE teacher_id = $1
    `, [teacherId]);
    
    // Récupérer les noms des classes pour plus de détail
    const { rows: classDetails } = await db.query(`
      SELECT c.name as class_name
      FROM my_schema.teacher_classes tc
      JOIN my_schema.classes c ON tc.class_id = c.id
      WHERE tc.teacher_id = $1
      ORDER BY c.name
    `, [teacherId]);
    
    // Réponse avec le compte et les détails
    res.json({
      teacher_id: teacherId,
      total_classes: parseInt(rows[0].class_count, 10),
      classes: classDetails.map(c => c.class_name)
    });
  } catch (err) {
    console.error('Error in /api/teachers/:id/classes/count:', err);
    res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
});

app.get('/api/teachers/:id/students/count', async (req, res) => {
  const teacherId = req.params.id; // Récupérer l'ID de l'enseignant depuis l'URL
  
  try {
    // Requête SQL pour récupérer le nombre d'élèves pour cet enseignant spécifique
    const { rows } = await db.query(`
      SELECT 
        t.id as teacher_id,
        t.first_name,
        t.last_name,
        s.name as subject,
        COUNT(DISTINCT u.id) as total_students,
        ARRAY_AGG(DISTINCT c.name) as classes
      FROM my_schema.users t
      JOIN my_schema.subjects s ON t.subject_id = s.id
      LEFT JOIN my_schema.teacher_classes tc ON t.id = tc.teacher_id
      LEFT JOIN my_schema.classes c ON tc.class_id = c.id
      LEFT JOIN my_schema.users u ON u.class_id = c.id AND u.role = 'student'
      WHERE t.role = 'teacher' AND t.id = $1  -- Filtrer par teacher_id
      GROUP BY t.id, t.first_name, t.last_name, s.name
      ORDER BY t.last_name, t.first_name
    `, [teacherId]); // Passer l'ID de l'enseignant dans la requête
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Enseignant non trouvé' });
    }

    // Formater les résultats
    const formattedResults = rows.map(teacher => ({
      teacher_id: teacher.teacher_id,
      teacher_name: `${teacher.first_name} ${teacher.last_name}`,
      subject: teacher.subject,
      total_students: parseInt(teacher.total_students || 0, 10),
      classes: teacher.classes.filter(c => c !== null) // Filtrer les valeurs nulles
    }));

    res.json(formattedResults);  // Retourner les données formatées
  } catch (err) {
    console.error('Error in /api/teachers/:id/students/count:', err);
    res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
});



// Add these API endpoints to your existing server.js file

// API to get average grades by class for a specific teacher
app.get('/api/teachers/:id/class-averages', async (req, res) => {
  const teacherId = req.params.id;
  
  try {
    // Verify user is a teacher
    const { rows: teacherCheck } = await db.query(
      'SELECT 1 FROM my_schema.users WHERE id = $1 AND role = $2',
      [teacherId, 'teacher']
    );
    
    if (!teacherCheck.length) {
      return res.status(404).json({ error: 'Enseignant non trouvé' });
    }
    
    // Get average grades for each class taught by this teacher
    const { rows } = await db.query(`
      SELECT 
        c.name as class_name,
        ROUND(AVG(g.grade)::numeric, 2) as average_grade
      FROM my_schema.teacher_classes tc
      JOIN my_schema.classes c ON tc.class_id = c.id
      JOIN my_schema.evaluations e ON e.class_id = c.id AND e.teacher_id = tc.teacher_id
      JOIN my_schema.grades g ON g.evaluation_id = e.id
      WHERE tc.teacher_id = $1
      GROUP BY c.name
      ORDER BY c.name
    `, [teacherId]);
    
    res.json(rows);
  } catch (err) {
    console.error('Error in /api/teachers/:id/class-averages:', err);
    res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
});

// API to get attendance rates by class for a specific teacher
app.get('/api/teachers/:id/attendance-rates', async (req, res) => {
  const teacherId = req.params.id;
  
  try {
    // Verify user is a teacher
    const { rows: teacherCheck } = await db.query(
      'SELECT 1 FROM my_schema.users WHERE id = $1 AND role = $2',
      [teacherId, 'teacher']
    );
    
    if (!teacherCheck.length) {
      return res.status(404).json({ error: 'Enseignant non trouvé' });
    }
    
    // Get subject ID for this teacher
    const { rows: teacherData } = await db.query(
      'SELECT subject_id FROM my_schema.users WHERE id = $1',
      [teacherId]
    );
    
    if (!teacherData.length || !teacherData[0].subject_id) {
      return res.status(400).json({ error: 'Information sur la matière manquante' });
    }
    
    const subjectId = teacherData[0].subject_id;
    
    // Get attendance rates for each class taught by this teacher
    const { rows } = await db.query(`
      WITH teacher_classes AS (
        SELECT c.id as class_id, c.name as class_name
        FROM my_schema.teacher_classes tc
        JOIN my_schema.classes c ON tc.class_id = c.id
        WHERE tc.teacher_id = $1
      ),
      attendance_data AS (
        SELECT 
          tc.class_name,
          u.id as student_id,
          COUNT(CASE WHEN a.status = 'present' THEN 1 END) as present_count,
          COUNT(a.id) as total_count
        FROM teacher_classes tc
        JOIN my_schema.users u ON u.class_id = tc.class_id AND u.role = 'student'
        LEFT JOIN my_schema.attendance a ON a.student_id = u.id AND a.subject_id = $2
        GROUP BY tc.class_name, u.id
      )
      SELECT 
        class_name,
        ROUND(
          (SUM(present_count)::numeric / NULLIF(SUM(total_count), 0) * 100)::numeric, 
          2
        ) as attendance_rate
      FROM attendance_data
      GROUP BY class_name
      ORDER BY class_name
    `, [teacherId, subjectId]);
    
    // Handle case with no attendance data
    if (rows.length === 0) {
      // Get just the class names to return empty data
      const { rows: classNames } = await db.query(`
        SELECT DISTINCT c.name as class_name
        FROM my_schema.teacher_classes tc
        JOIN my_schema.classes c ON tc.class_id = c.id
        WHERE tc.teacher_id = $1
        ORDER BY c.name
      `, [teacherId]);
      
      const emptyData = classNames.map(c => ({
        class_name: c.class_name,
        attendance_rate: 0
      }));
      
      return res.json(emptyData);
    }
    
    res.json(rows);
  } catch (err) {
    console.error('Error in /api/teachers/:id/attendance-rates:', err);
    res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
});

app.get('/api/teachers/:id/attendance-trends', async (req, res) => {
  const teacherId = req.params.id;
  
  try {
    // Verify user is a teacher
    const { rows: teacherCheck } = await db.query(
      'SELECT 1 FROM my_schema.users WHERE id = $1 AND role = $2',
      [teacherId, 'teacher']
    );
    
    if (!teacherCheck.length) {
      return res.status(404).json({ error: 'Enseignant non trouvé' });
    }
    
    // Get subject ID for this teacher
    const { rows: teacherData } = await db.query(
      'SELECT subject_id FROM my_schema.users WHERE id = $1',
      [teacherId]
    );
    
    const subjectId = teacherData[0]?.subject_id;
    
    // Get monthly attendance trends
    const { rows } = await db.query(`
      WITH teacher_classes AS (
        SELECT c.id as class_id
        FROM my_schema.teacher_classes tc
        JOIN my_schema.classes c ON tc.class_id = c.id
        WHERE tc.teacher_id = $1
      ),
      class_students AS (
        SELECT u.id as student_id
        FROM my_schema.users u
        JOIN teacher_classes tc ON u.class_id = tc.class_id
        WHERE u.role = 'student'
      ),
      monthly_data AS (
        SELECT 
          TO_CHAR(a.date, 'YYYY-MM') as month,
          COUNT(CASE WHEN a.status = 'present' THEN 1 END) as present_count,
          COUNT(a.id) as total_count
        FROM my_schema.attendance a
        JOIN class_students cs ON a.student_id = cs.student_id
        WHERE a.subject_id = $2
        GROUP BY TO_CHAR(a.date, 'YYYY-MM')
      )
      SELECT 
        month,
        ROUND(
          (present_count::numeric / NULLIF(total_count, 0) * 100)::numeric, 
          2
        ) as attendance_rate
      FROM monthly_data
      ORDER BY month
    `, [teacherId, subjectId]);
    
    res.json(rows);
  } catch (err) {
    console.error('Error in /api/teachers/:id/attendance-trends:', err);
    res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
});

app.get('/api/teachers/:id/grade-trends', async (req, res) => {
  const teacherId = req.params.id;
  
  try {
    // Get monthly grade averages
    const { rows } = await db.query(`
      WITH teacher_evaluations AS (
        SELECT e.id as evaluation_id, TO_CHAR(e.date, 'YYYY-MM') as month
        FROM my_schema.evaluations e
        WHERE e.teacher_id = $1
      )
      SELECT 
        te.month,
        ROUND(AVG(g.grade)::numeric, 2) as average_grade
      FROM teacher_evaluations te
      JOIN my_schema.grades g ON g.evaluation_id = te.evaluation_id
      GROUP BY te.month
      ORDER BY te.month
    `, [teacherId]);
    
    res.json(rows);
  } catch (err) {
    console.error('Error in /api/teachers/:id/grade-trends:', err);
    res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
});

app.get('/api/teachers/:id/subject-comparison', async (req, res) => {
  const teacherId = req.params.id;
  
  try {
    // Get teacher's subject
    const { rows: teacherData } = await db.query(
      'SELECT subject_id FROM my_schema.users WHERE id = $1',
      [teacherId]
    );
    
    if (!teacherData.length || !teacherData[0].subject_id) {
      return res.status(400).json({ error: 'Information sur la matière manquante' });
    }
    
    const teacherSubjectId = teacherData[0].subject_id;
    
    // Get the classes taught by this teacher
    const { rows: teacherClasses } = await db.query(`
      SELECT DISTINCT c.id as class_id
      FROM my_schema.teacher_classes tc
      JOIN my_schema.classes c ON tc.class_id = c.id
      WHERE tc.teacher_id = $1
    `, [teacherId]);
    
    if (!teacherClasses.length) {
      return res.json([]);
    }
    
    const classIds = teacherClasses.map(c => c.class_id);
    
    // Get average grades by subject for these classes
    const { rows } = await db.query(`
      SELECT 
        s.name as subject_name,
        ROUND(AVG(g.grade)::numeric, 2) as average_grade
      FROM my_schema.evaluations e
      JOIN my_schema.subjects s ON e.subject_id = s.id
      JOIN my_schema.grades g ON g.evaluation_id = e.id
      WHERE e.class_id = ANY($1::int[])
      GROUP BY s.name
      ORDER BY average_grade DESC
    `, [classIds]);
    
    res.json(rows);
  } catch (err) {
    console.error('Error in /api/teachers/:id/subject-comparison:', err);
    res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
});







app.get('/api/teachers/:id/classes', async (req, res) => {
  const teacherId = req.params.id;
  
  try {
    // Verify the user is a teacher
    const { rows: teacherCheck } = await db.query(
      'SELECT 1 FROM my_schema.users WHERE id = $1 AND role = $2',
      [teacherId, 'teacher']
    );
    
    if (!teacherCheck.length) {
      return res.status(404).json({ error: 'Enseignant non trouvé' });
    }
    
    // Get all classes assigned to this teacher
    const { rows } = await db.query(`
      SELECT c.id, c.name
      FROM my_schema.teacher_classes tc
      JOIN my_schema.classes c ON tc.class_id = c.id
      WHERE tc.teacher_id = $1
      ORDER BY c.name
    `, [teacherId]);
    
    res.json(rows);
  } catch (err) {
    console.error('Error in /api/teachers/:id/classes:', err);
    res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
});

app.get('/api/teachers/:id/classes/:classId/students', async (req, res) => {
  const teacherId   = req.params.id;
  const classId     = req.params.classId;
  const evaluationId = req.query.evaluationId; // optional

  try {
    // … your checks for teacher existence and class assignment …

    // Base SELECT
    let sql = `
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        c.name AS class_name
    `;

    // Add grade columns if needed
    if (evaluationId) {
      sql += `,
        g.grade,
        g.comment,
        e.title            AS evaluation_title,
        e.date             AS evaluation_date,
        e.coefficient      AS evaluation_coefficient
      `;
    }

    sql += `
      FROM my_schema.users u
      JOIN my_schema.classes c 
        ON u.class_id = c.id
    `;

    if (evaluationId) {
      sql += `
        LEFT JOIN my_schema.grades g 
          ON u.id = g.student_id 
         AND g.evaluation_id = $2
        LEFT JOIN my_schema.evaluations e 
          ON e.id = g.evaluation_id
      `;
    }

    sql += `
      WHERE u.role = 'student'
        AND u.class_id = $1
      ORDER BY u.last_name, u.first_name
    `;

    // Build params to match $1, $2
    const params = evaluationId 
      ? [classId, evaluationId] 
      : [classId];

    const { rows } = await db.query(sql, params);
    return res.json(rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
});


app.post('/api/teachers/:id/evaluations', async (req, res) => {
  const teacherId = req.params.id;
  const { title, date, coefficient, classId } = req.body;
  
  // Validate required fields
  if (!title || !date || !classId) {
    return res.status(400).json({ error: 'Champs manquants' });
  }
  
  try {
    // Verify the user is a teacher
    const { rows: teacherData } = await db.query(
      'SELECT id, subject_id FROM my_schema.users WHERE id = $1 AND role = $2',
      [teacherId, 'teacher']
    );
    
    if (!teacherData.length) {
      return res.status(404).json({ error: 'Enseignant non trouvé' });
    }
    
    const subjectId = teacherData[0].subject_id;
    
    // Verify the teacher teaches this class
    const { rows: classCheck } = await db.query(
      'SELECT 1 FROM my_schema.teacher_classes WHERE teacher_id = $1 AND class_id = $2',
      [teacherId, classId]
    );
    
    if (!classCheck.length) {
      return res.status(403).json({ error: 'Vous n\'êtes pas assigné à cette classe' });
    }
    
    // Create the evaluation
    const { rows } = await db.query(`
      INSERT INTO my_schema.evaluations 
        (title, date, coefficient, subject_id, class_id, teacher_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, title, date, coefficient
    `, [title, date, coefficient || 1, subjectId, classId, teacherId]);
    
    res.status(201).json({
      message: 'Évaluation créée avec succès',
      evaluation: rows[0]
    });
  } catch (err) {
    console.error('Error in POST /api/teachers/:id/evaluations:', err);
    res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
});


app.post('/api/teachers/:id/grades', async (req, res) => {
  const teacherId = req.params.id;
  const { studentId, evaluationId, grade, remarks } = req.body;

  // Validation
  if (!studentId || !evaluationId || grade === undefined) {
    return res.status(400).json({ error: 'Champs manquants' });
  }

  if (grade < 0 || grade > 20) {
    return res.status(400).json({ error: 'La note doit être comprise entre 0 et 20' });
  }

  try {
    // Check if the teacher owns the evaluation
    const { rows: evalCheck } = await db.query(
      'SELECT 1 FROM my_schema.evaluations WHERE id = $1 AND teacher_id = $2',
      [evaluationId, teacherId]
    );

    if (!evalCheck.length) {
      return res.status(403).json({ error: 'Vous n\'êtes pas autorisé à modifier cette évaluation' });
    }

    // Check for existing grade
    const { rows: gradeCheck } = await db.query(
      'SELECT id FROM my_schema.grades WHERE student_id = $1 AND evaluation_id = $2',
      [studentId, evaluationId]
    );

    let result;

    if (gradeCheck.length) {
      // Update
      const { rows } = await db.query(
        `UPDATE my_schema.grades
         SET grade = $1, remarks = $2
         WHERE student_id = $3 AND evaluation_id = $4
         RETURNING id, grade, remarks`,
        [grade, remarks, studentId, evaluationId]
      );

      result = {
        message: 'Note mise à jour avec succès',
        grade: rows[0]
      };
    } else {
      // Insert
      const { rows } = await db.query(
        `INSERT INTO my_schema.grades
         (student_id, evaluation_id, grade, remarks)
         VALUES ($1, $2, $3, $4)
         RETURNING id, grade, remarks`,
        [studentId, evaluationId, grade, remarks]
      );

      result = {
        message: 'Note ajoutée avec succès',
        grade: rows[0]
      };
    }

    res.status(201).json(result);
  } catch (err) {
    console.error('Error in POST /api/teachers/:id/grades:', err);
    res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
});

app.get('/api/teachers/:id/evaluations/:evaluationId/grades', async (req, res) => {
  const teacherId = req.params.id;
  const evaluationId = req.params.evaluationId;

  try {
    // Vérifier que l'évaluation appartient à l'enseignant
    const { rows: evalCheck } = await db.query(
      'SELECT 1 FROM my_schema.evaluations WHERE id = $1 AND teacher_id = $2',
      [evaluationId, teacherId]
    );

    if (!evalCheck.length) {
      return res.status(403).json({ error: 'Vous n\'êtes pas autorisé à consulter cette évaluation' });
    }

    // Récupérer les notes et remarques avec les infos étudiants
    const { rows: grades } = await db.query(
      `SELECT g.id, g.grade, g.remarks, u.id AS student_id, u.first_name, u.last_name
       FROM my_schema.grades g
       JOIN my_schema.users u ON g.student_id = u.id
       WHERE g.evaluation_id = $1 AND u.role = 'student'`,
      [evaluationId]
    );

    res.json({ grades });
  } catch (err) {
    console.error('Error in GET /api/teachers/:id/evaluations/:evaluationId/grades:', err);
    res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
});

app.get('/api/teachers/:id/evaluations', async (req, res) => {
  const teacherId = req.params.id;
  const classId = req.query.classId; // Optional filter by class
  
  try {
    // Build query
    let query = `
      SELECT 
        e.id, 
        e.title, 
        e.date, 
        e.coefficient,
        c.id as class_id,
        c.name as class_name,
        s.id as subject_id,
        s.name as subject_name,
        (SELECT COUNT(*) FROM my_schema.grades WHERE evaluation_id = e.id) as grades_count
      FROM my_schema.evaluations e
      JOIN my_schema.classes c ON e.class_id = c.id
      JOIN my_schema.subjects s ON e.subject_id = s.id
      WHERE e.teacher_id = $1
    `;
    
    const queryParams = [teacherId];
    
    // Add class filter if provided
    if (classId) {
      query += ' AND e.class_id = $2';
      queryParams.push(classId);
    }
    
    query += ' ORDER BY e.date DESC';
    
    const { rows } = await db.query(query, queryParams);
    
    res.json(rows);
  } catch (err) {
    console.error('Error in GET /api/teachers/:id/evaluations:', err);
    res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
});







// API to get attendance status for all students
app.get('/api/attendance/status', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT 
        u.id as student_id,
        u.first_name,
        u.last_name,
        c.name as class_name,
        s.name as subject_name,
        a.date,
        a.status
      FROM my_schema.users u
      JOIN my_schema.classes c ON u.class_id = c.id
      JOIN my_schema.attendance a ON a.student_id = u.id
      JOIN my_schema.subjects s ON a.subject_id = s.id
      WHERE u.role = 'student'
      ORDER BY a.date DESC, u.last_name, u.first_name
    `);
    
    res.json(rows);
  } catch (err) {
    console.error('Error in GET /api/attendance/status:', err);
    res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
});

// API to get attendance status for a specific student
app.get('/api/attendance/status/:studentId', async (req, res) => {
  const studentId = req.params.studentId;
  
  try {
    // Verify student exists
    const { rows: studentCheck } = await db.query(
      'SELECT 1 FROM my_schema.users WHERE id = $1 AND role = $2',
      [studentId, 'student']
    );
    
    if (!studentCheck.length) {
      return res.status(404).json({ error: 'Élève non trouvé' });
    }
    
    const { rows } = await db.query(`
      SELECT 
        a.id as attendance_id,
        s.name as subject_name,
        a.date,
        a.status
      FROM my_schema.attendance a
      JOIN my_schema.subjects s ON a.subject_id = s.id
      WHERE a.student_id = $1
      ORDER BY a.date DESC, s.name
    `, [studentId]);
    
    res.json(rows);
  } catch (err) {
    console.error('Error in GET /api/attendance/status/:studentId:', err);
    res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
});

// API to get attendance status for students in a specific class
app.get('/api/attendance/status/class/:classId', async (req, res) => {
  const classId = req.params.classId;
  const date = req.query.date; // Optional: filter by specific date
  const subjectId = req.query.subjectId; // Optional: filter by specific subject
  
  try {
    // Verify class exists
    const { rows: classCheck } = await db.query(
      'SELECT 1 FROM my_schema.classes WHERE id = $1',
      [classId]
    );
    
    if (!classCheck.length) {
      return res.status(404).json({ error: 'Classe non trouvée' });
    }
    
    // Build dynamic query with optional filters
    let query = `
      SELECT 
        u.id as student_id,
        u.first_name,
        u.last_name,
        s.name as subject_name,
        a.date,
        a.status
      FROM my_schema.users u
      LEFT JOIN my_schema.attendance a ON a.student_id = u.id
      LEFT JOIN my_schema.subjects s ON a.subject_id = s.id
      WHERE u.role = 'student' AND u.class_id = $1
    `;
    
    const queryParams = [classId];
    let paramCounter = 2;
    
    if (date) {
      query += ` AND a.date = $${paramCounter}`;
      queryParams.push(date);
      paramCounter++;
    }
    
    if (subjectId) {
      query += ` AND a.subject_id = $${paramCounter}`;
      queryParams.push(subjectId);
    }
    
    query += ` ORDER BY u.last_name, u.first_name, a.date DESC`;
    
    const { rows } = await db.query(query, queryParams);
    
    res.json(rows);
  } catch (err) {
    console.error('Error in GET /api/attendance/status/class/:classId:', err);
    res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
});

app.post('/api/attendance/record', async (req, res) => {
  const { studentId, subjectId, date, status } = req.body;
  
  // Validate required fields
  if (!studentId || !subjectId || !date || !status) {
    return res.status(400).json({ error: 'Champs manquants' });
  }
  
  // Validate status enum
  if (!['present', 'absent', 'late'].includes(status)) {
    return res.status(400).json({ error: 'Statut invalide' });
  }
  
  try {
    // Check for existing attendance record
    const { rows: existingCheck } = await db.query(
      'SELECT id FROM my_schema.attendance WHERE student_id = $1 AND subject_id = $2 AND date = $3',
      [studentId, subjectId, date]
    );
    
    let result;
    
    if (existingCheck.length > 0) {
      // Update existing record
      const { rows } = await db.query(`
        UPDATE my_schema.attendance
        SET status = $1
        WHERE student_id = $2 AND subject_id = $3 AND date = $4
        RETURNING id, status, student_id, subject_id, date
      `, [status, studentId, subjectId, date]);
      
      result = {
        message: 'Présence mise à jour avec succès',
        attendance: rows[0]
      };
    } else {
      // Create new record
      const { rows } = await db.query(`
        INSERT INTO my_schema.attendance
          (student_id, subject_id, date, status)
        VALUES ($1, $2, $3, $4)
        RETURNING id, status, student_id, subject_id, date
      `, [studentId, subjectId, date, status]);
      
      result = {
        message: 'Présence enregistrée avec succès',
        attendance: rows[0]
      };
    }
    
    res.status(201).json(result);
  } catch (err) {
    console.error('Error in POST /api/attendance/record:', err);
    res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
});

// API to record attendance for multiple students at once (bulk operation) - FIXED VERSION
app.post('/api/attendance/bulk-record', async (req, res) => {
  const { records } = req.body;

  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: 'Données invalides' });
  }

  try {
    const results = [];
    await db.query('BEGIN');

    for (const [idx, record] of records.entries()) {
      const { studentId, subjectId, date, status } = record;

      // Validation stricte : seulement null ou undefined
      if (
        studentId == null ||
        subjectId == null ||
        date == null ||
        status == null
      ) {
        await db.query('ROLLBACK');
        return res
          .status(400)
          .json({
            error: 'Champs manquants dans les enregistrements',
            details: `Record #${idx + 1} invalide`
          });
      }

      // Statut autorisé uniquement
      if (!['present', 'absent', 'late'].includes(status)) {
        await db.query('ROLLBACK');
        return res
          .status(400)
          .json({
            error: 'Statut invalide dans les enregistrements',
            details: `Record #${idx + 1} : statut « ${status} »`
          });
      }

      const { rows: existing } = await db.query(
        `SELECT id FROM my_schema.attendance
         WHERE student_id = $1 AND subject_id = $2 AND date = $3`,
        [studentId, subjectId, date]
      );

      let row;
      if (existing.length > 0) {
        ({ rows: [row] } = await db.query(`
          UPDATE my_schema.attendance
          SET status = $1
          WHERE student_id = $2 AND subject_id = $3 AND date = $4
          RETURNING id, student_id, subject_id, date, status
        `, [status, studentId, subjectId, date]));
      } else {
        ({ rows: [row] } = await db.query(`
          INSERT INTO my_schema.attendance
            (student_id, subject_id, date, status)
          VALUES ($1, $2, $3, $4)
          RETURNING id, student_id, subject_id, date, status
        `, [studentId, subjectId, date, status]));
      }

      results.push(row);
    }

    await db.query('COMMIT');
    res.status(201).json({
      message: 'Présences enregistrées avec succès',
      records: results
    });

  } catch (err) {
    await db.query('ROLLBACK');
    console.error('Error in POST /api/attendance/bulk-record:', err);
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
