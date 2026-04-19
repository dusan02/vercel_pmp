import sqlite3
import os

db_path = os.path.join('prisma', 'data', 'premarket.db')
conn = sqlite3.connect(db_path)
cur = conn.cursor()
cur.execute("SELECT fiscalYear, fiscalPeriod, totalDebt, cashAndEquivalents FROM FinancialStatement WHERE symbol='LLY' ORDER BY endDate DESC LIMIT 10")
rows = cur.fetchall()
print("fiscalYear | fiscalPeriod | totalDebt | cashAndEquivalents")
print("-" * 70)
for r in rows:
    print(r)
if not rows:
    print("No LLY records found.")
conn.close()
