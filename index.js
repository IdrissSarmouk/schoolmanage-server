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

// API to get monthly attendance trend for all classes of a teacher
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

// API to get average grades by month for a teacher's classes
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

// API to get subject comparison for a teacher's classes
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
