// deno test supabase/functions/interview-intel/
import { assertEquals } from "jsr:@std/assert@1";
import { classify, companyFromDomain, parseTitle } from "./classify.ts";
import { ev, ME } from "./test_helpers.ts";

Deno.test("título: empresa y puesto en formatos habituales", () => {
  assertEquals(parseTitle("Entrevista Data Analyst - Acme"), { company: "Acme", role: "Data Analyst" });
  assertEquals(parseTitle("Acme Analytics | Entrevista técnica"), { company: "Acme Analytics", role: null });
  assertEquals(parseTitle("Interview with Globex (Power BI Developer)").company, "Globex");
  assertEquals(parseTitle("Entrevista con RRHH").company, null);
});
Deno.test("título: «Entrevista con Laura» no convierte a una persona en empresa; se usa el dominio", () => {
  assertEquals(parseTitle("Entrevista con Laura", ["Laura Gómez"]).company, null);
  const c = classify(ev({ title: "Entrevista con Laura" }), [ME]);
  assertEquals(c.company, "Acme");
  assertEquals(companyFromDomain("grupo-norte.es"), "Grupo Norte");
  assertEquals(companyFromDomain("gmail.com"), null);
  assertEquals(companyFromDomain("acme.greenhouse.io"), null);
});
Deno.test("ATS y correo gratuito: el dominio de la herramienta no es la empresa", () => {
  const c = classify(ev({ title: "Interview", organizer: { name: "Talent", email: "no-reply@greenhouse.io" },
    attendees: [{ name: "Ana", email: "ana@gmail.com", partstat: "ACCEPTED" }, { name: null, email: ME, partstat: "NEEDS-ACTION" }] }), [ME]);
  assertEquals(c.classification, "interview");
  assertEquals(c.company_domain, null);
});
