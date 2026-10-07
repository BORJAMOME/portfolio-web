// deno test supabase/functions/calendario-sync/ical.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import { parse } from "./ical.ts";

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Google Inc//Google Calendar 70.9054//EN
BEGIN:VTIMEZONE
TZID:Europe/Madrid
BEGIN:DAYLIGHT
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
TZNAME:CEST
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
TZNAME:CET
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:simple@x
DTSTART;TZID=Europe/Madrid:20261015T100000
DTEND;TZID=Europe/Madrid:20261015T110000
SUMMARY:Entrevista técnica · Acme
LOCATION:Google Meet
END:VEVENT
BEGIN:VEVENT
UID:semanal@x
DTSTART;TZID=Europe/Madrid:20261019T090000
DTEND;TZID=Europe/Madrid:20261019T093000
RRULE:FREQ=WEEKLY;COUNT=4
EXDATE;TZID=Europe/Madrid:20261026T090000
SUMMARY:Bloque de estudio
END:VEVENT
BEGIN:VEVENT
UID:semanal@x
RECURRENCE-ID;TZID=Europe/Madrid:20261102T090000
DTSTART;TZID=Europe/Madrid:20261102T120000
DTEND;TZID=Europe/Madrid:20261102T130000
SUMMARY:Bloque de estudio (movido)
END:VEVENT
BEGIN:VEVENT
UID:diacompleto@x
DTSTART;VALUE=DATE:20261012
DTEND;VALUE=DATE:20261013
SUMMARY:Festivo
END:VEVENT
BEGIN:VEVENT
UID:cancelado@x
DTSTART:20261020T080000Z
DTEND:20261020T090000Z
STATUS:CANCELLED
SUMMARY:No debería salir
END:VEVENT
BEGIN:VEVENT
UID:viejo@x
DTSTART:20200101T080000Z
DTEND:20200101T090000Z
SUMMARY:Fuera de la ventana
END:VEVENT
END:VCALENDAR`.replace(/\n/g, "\r\n");

const rows = parse(ICS, new Date("2026-09-01T00:00:00Z"), new Date("2027-09-01T00:00:00Z"));
const by = (uid: string) => rows.filter((r) => r.uid === uid).map((r) => [r.starts_at, r.ends_at, r.title]);

Deno.test("evento con zona horaria → UTC (CEST, +2)", () => {
  assertEquals(by("simple@x"), [["2026-10-15T08:00:00.000Z", "2026-10-15T09:00:00.000Z", "Entrevista técnica · Acme"]]);
});

Deno.test("recurrente: cambio de hora, EXDATE y ocurrencia movida", () => {
  assertEquals(by("semanal@x"), [
    ["2026-10-19T07:00:00.000Z", "2026-10-19T07:30:00.000Z", "Bloque de estudio"],          // CEST
    ["2026-11-02T11:00:00.000Z", "2026-11-02T12:00:00.000Z", "Bloque de estudio (movido)"], // CET y movido
    ["2026-11-09T08:00:00.000Z", "2026-11-09T08:30:00.000Z", "Bloque de estudio"],
  ]);
});

Deno.test("día completo a medianoche UTC", () => {
  const r = rows.find((x) => x.uid === "diacompleto@x")!;
  assertEquals([r.starts_at, r.ends_at, r.all_day], ["2026-10-12T00:00:00.000Z", "2026-10-13T00:00:00.000Z", true]);
});

Deno.test("cancelados y fuera de ventana no entran", () => {
  assertEquals(by("cancelado@x").length + by("viejo@x").length, 0);
});
