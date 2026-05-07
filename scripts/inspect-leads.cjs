require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const databaseUrl = (process.env.DATABASE_URL || '').replace(/^"|"$/g, '');
  const pool = mysql.createPool(databaseUrl);

  const [statusRows] = await pool.query(
    'SELECT status, COUNT(*) AS total FROM leads WHERE deleted_at IS NULL GROUP BY status ORDER BY total DESC',
  );
  const [sampleRows] = await pool.query(
    'SELECT id, nome, nome_quadra, telefone, status, prioridade, created FROM leads WHERE deleted_at IS NULL ORDER BY created DESC LIMIT 5',
  );
  const [interactionColumns] = await pool.query('SHOW COLUMNS FROM lead_interacoes');
  const [interactionRows] = await pool.query(
    'SELECT id, lead_id, tipo, mensagem, status_anterior, status_novo FROM lead_interacoes ORDER BY id DESC LIMIT 10',
  );
  const [foreignKeys] = await pool.query(
    `
      SELECT
        kcu.CONSTRAINT_NAME,
        kcu.TABLE_NAME,
        kcu.COLUMN_NAME,
        kcu.REFERENCED_TABLE_NAME,
        kcu.REFERENCED_COLUMN_NAME
      FROM information_schema.KEY_COLUMN_USAGE kcu
      WHERE kcu.TABLE_SCHEMA = DATABASE()
        AND kcu.TABLE_NAME = 'lead_interacoes'
        AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
    `,
  );

  console.log(JSON.stringify({ statusRows, sampleRows, interactionColumns, interactionRows, foreignKeys }, null, 2));
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});