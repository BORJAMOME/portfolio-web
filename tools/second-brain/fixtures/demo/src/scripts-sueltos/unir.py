import pandas as pd
a = pd.read_csv("a.csv")
b = pd.read_csv("b.csv")
pd.merge(a, b, on="id").to_sql("union", con=None)
