import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import cross_val_score, train_test_split

df = pd.read_csv("clientes.csv").dropna()
X, y = df.drop(columns="abandono"), df["abandono"]
X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2)
modelo = RandomForestClassifier().fit(X_tr, y_tr)
print(cross_val_score(modelo, X, y, cv=5, scoring="roc_auc"))
