const sequelize = require('./database');
const User = require('../models/User');

async function syncDatabase() {
  try {
    // Synchronisation des modèles avec la base de données
    await sequelize.sync({ force: true }); // force: true pour supprimer et recréer la table (pendant le dev uniquement)
    console.log('Base de données synchronisée');
  } catch (error) {
    console.error('Erreur lors de la synchronisation de la base de données :', error);
  }
}

syncDatabase();
