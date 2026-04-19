import sqlite3
import os

db_path = os.path.join('prisma', 'data', 'premarket.db')
conn = sqlite3.connect(db_path)
cur = conn.cursor()
cur.execute("SELECT fiscalYear, fiscalPeriod, totalDebt, cashAndEquivalents, capex, operatingCashFlow FROM FinancialStatement WHERE symbol='LLY' ORDER BY endDate DESC LIMIT 5")
rows = cur.fetchall()
print("fiscalYear | fiscalPeriod | totalDebt | cashAndEquivalents | capex | ocf")
print("-" * 80)
for r in rows:
    print(r)
conn.close()
