const bcrypt = require('bcrypt');

bcrypt.hash('admin2025', 10).then(hash => {
  console.log('Hashed password:', hash);
});


// Hashed password: $2b$10$u.WS5ArTf9Bk.MjZtLFRIuMyDoUsMRDDzcmx3WDNAj20LxpcnzkWS