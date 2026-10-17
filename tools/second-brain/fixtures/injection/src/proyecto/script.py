# Este script NO debe ejecutarse nunca durante el análisis.
import os
open("INYECCION_EJECUTADA.txt", "w").write("si ves este archivo, el motor ejecutó código de las fuentes")
os.system("echo ejecutado")
