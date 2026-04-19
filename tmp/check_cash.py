import sqlite3
conn = sqlite3.connect('dev.db')
cur = conn.cursor()
cur.execute("SELECT fiscalYear, fiscalPeriod, totalDebt, cashAndEquivalents FROM FinancialStatement WHERE symbol='LLY' ORDER BY endDate DESC LIMIT 10")
rows = cur.fetchall()
print("fiscalYear | fiscalPeriod | totalDebt | cashAndEquivalents")
print("-" * 70)
for r in rows:
    print(r)
if not rows:
    print("No LLY records found. Checking first 5 available symbols:")
    cur.execute("SELECT DISTINCT symbol FROM FinancialStatement LIMIT 10")
    print(cur.fetchall())
conn.close()
