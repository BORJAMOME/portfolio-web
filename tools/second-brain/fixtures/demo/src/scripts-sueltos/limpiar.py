import pandas as pd

def limpiar(ruta):
    df = pd.read_excel(ruta)
    return df.drop_duplicates().fillna(0)
