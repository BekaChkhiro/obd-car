// SAE generic DTC descriptions — en + ka (Georgian).
// Covers the P0xxx and P2xxx code ranges that are standardised across all makes.
// Manufacturer-specific codes (P1xxx, P3xxx, B1xxx, U1xxx, …) are intentionally
// omitted; Claude interprets those from the raw code.

export type DtcLocale = 'en' | 'ka';

interface DtcDescription {
  en: string;
  ka: string;
}

// Key is the full DTC code string as returned by dtcFromBytes (e.g. "P0300").
const SAE_DESCRIPTIONS: Readonly<Record<string, DtcDescription>> = {
  // ── Air Metering ───────────────────────────────────────────────────────────
  P0100: { en: 'Mass Air Flow Circuit Malfunction', ka: 'ჰაერის მასის სენსორის წრის გაუმართაობა' },
  P0101: { en: 'Mass Air Flow Range/Performance', ka: 'ჰაერის მასის სენსორი — მუშაობის დიაპაზონი' },
  P0102: { en: 'Mass Air Flow Circuit Low Input', ka: 'ჰაერის მასის სენსორი — დაბალი სიგნალი' },
  P0103: { en: 'Mass Air Flow Circuit High Input', ka: 'ჰაერის მასის სენსორი — მაღალი სიგნალი' },
  P0104: { en: 'Mass Air Flow Circuit Intermittent', ka: 'ჰაერის მასის სენსორი — წყვეტილი სიგნალი' },
  P0110: { en: 'Intake Air Temperature Circuit Malfunction', ka: 'სასუნთქი ჰაერის ტემპერატურის სენსორი — გაუმართაობა' },
  P0111: { en: 'Intake Air Temperature Range/Performance', ka: 'სასუნთქი ჰაერის ტემპ. სენსორი — დიაპაზონი' },
  P0112: { en: 'Intake Air Temperature Circuit Low Input', ka: 'სასუნთქი ჰაერის ტემპ. სენსორი — დაბალი სიგნალი' },
  P0113: { en: 'Intake Air Temperature Circuit High Input', ka: 'სასუნთქი ჰაერის ტემპ. სენსორი — მაღალი სიგნალი' },

  // ── Throttle / Coolant ─────────────────────────────────────────────────────
  P0120: { en: 'Throttle Position Sensor/Switch A Circuit', ka: 'გასარქვავის პოზიციის სენსორი A — წრის გაუმართაობა' },
  P0121: { en: 'Throttle Position Sensor Range/Performance', ka: 'გასარქვავის პოზიციის სენსორი — მუშაობის დიაპაზონი' },
  P0122: { en: 'Throttle Position Sensor Circuit Low Input', ka: 'გასარქვავის სენსორი — დაბალი სიგნალი' },
  P0123: { en: 'Throttle Position Sensor Circuit High Input', ka: 'გასარქვავის სენსორი — მაღალი სიგნალი' },
  P0125: { en: 'Insufficient Coolant Temp for Closed Loop Fuel Control', ka: 'საგრილო სითხე არ არის გათბობილი — საწვავის კონტროლი შეუძლებელია' },
  P0128: { en: 'Coolant Thermostat Below Regulating Temperature', ka: 'სათბობელი თერმოსტატი — სარეგულაციო ტემპ. ქვემოთ' },

  // ── Oxygen Sensors ─────────────────────────────────────────────────────────
  P0130: { en: 'O2 Sensor Circuit Malfunction (Bank 1, Sensor 1)', ka: 'ჟანგბადის სენსორი (ბანკი 1, სენსორი 1) — გაუმართაობა' },
  P0131: { en: 'O2 Sensor Low Voltage (Bank 1, Sensor 1)', ka: 'ჟანგბადის სენსორი B1S1 — დაბალი ძაბვა' },
  P0132: { en: 'O2 Sensor High Voltage (Bank 1, Sensor 1)', ka: 'ჟანგბადის სენსორი B1S1 — მაღალი ძაბვა' },
  P0133: { en: 'O2 Sensor Slow Response (Bank 1, Sensor 1)', ka: 'ჟანგბადის სენსორი B1S1 — ნელი რეაქცია' },
  P0134: { en: 'O2 Sensor No Activity (Bank 1, Sensor 1)', ka: 'ჟანგბადის სენსორი B1S1 — არ მუშაობს' },
  P0135: { en: 'O2 Sensor Heater Circuit (Bank 1, Sensor 1)', ka: 'ჟანგბადის სენსორი B1S1 — გათბობის წრე' },
  P0136: { en: 'O2 Sensor Circuit (Bank 1, Sensor 2)', ka: 'ჟანგბადის სენსორი (ბანკი 1, სენსორი 2) — გაუმართაობა' },
  P0137: { en: 'O2 Sensor Low Voltage (Bank 1, Sensor 2)', ka: 'ჟანგბადის სენსორი B1S2 — დაბალი ძაბვა' },
  P0138: { en: 'O2 Sensor High Voltage (Bank 1, Sensor 2)', ka: 'ჟანგბადის სენსორი B1S2 — მაღალი ძაბვა' },
  P0140: { en: 'O2 Sensor No Activity (Bank 1, Sensor 2)', ka: 'ჟანგბადის სენსორი B1S2 — არ მუშაობს' },
  P0141: { en: 'O2 Sensor Heater Circuit (Bank 1, Sensor 2)', ka: 'ჟანგბადის სენსორი B1S2 — გათბობის წრე' },
  P0150: { en: 'O2 Sensor Circuit (Bank 2, Sensor 1)', ka: 'ჟანგბადის სენსორი (ბანკი 2, სენსორი 1) — გაუმართაობა' },
  P0151: { en: 'O2 Sensor Low Voltage (Bank 2, Sensor 1)', ka: 'ჟანგბადის სენსორი B2S1 — დაბალი ძაბვა' },
  P0152: { en: 'O2 Sensor High Voltage (Bank 2, Sensor 1)', ka: 'ჟანგბადის სენსორი B2S1 — მაღალი ძაბვა' },
  P0155: { en: 'O2 Sensor Heater Circuit (Bank 2, Sensor 1)', ka: 'ჟანგბადის სენსორი B2S1 — გათბობის წრე' },

  // ── Fuel Trim ──────────────────────────────────────────────────────────────
  P0171: { en: 'System Too Lean (Bank 1)', ka: 'ნარევი ძალიან გაღარიბებულია (ბანკი 1)' },
  P0172: { en: 'System Too Rich (Bank 1)', ka: 'ნარევი ძალიან გამდიდრებულია (ბანკი 1)' },
  P0174: { en: 'System Too Lean (Bank 2)', ka: 'ნარევი ძალიან გაღარიბებულია (ბანკი 2)' },
  P0175: { en: 'System Too Rich (Bank 2)', ka: 'ნარევი ძალიან გამდიდრებულია (ბანკი 2)' },

  // ── Fuel Injectors ─────────────────────────────────────────────────────────
  P0200: { en: 'Injector Circuit Malfunction', ka: 'ინჟექტორის წრის გაუმართაობა' },
  P0201: { en: 'Injector Circuit — Cylinder 1', ka: 'ინჟექტორი — 1-ლი ცილინდრი' },
  P0202: { en: 'Injector Circuit — Cylinder 2', ka: 'ინჟექტორი — მე-2 ცილინდრი' },
  P0203: { en: 'Injector Circuit — Cylinder 3', ka: 'ინჟექტორი — მე-3 ცილინდრი' },
  P0204: { en: 'Injector Circuit — Cylinder 4', ka: 'ინჟექტორი — მე-4 ცილინდრი' },
  P0205: { en: 'Injector Circuit — Cylinder 5', ka: 'ინჟექტორი — მე-5 ცილინდრი' },
  P0206: { en: 'Injector Circuit — Cylinder 6', ka: 'ინჟექტორი — მე-6 ცილინდრი' },
  P0207: { en: 'Injector Circuit — Cylinder 7', ka: 'ინჟექტორი — მე-7 ცილინდრი' },
  P0208: { en: 'Injector Circuit — Cylinder 8', ka: 'ინჟექტორი — მე-8 ცილინდრი' },

  // ── Misfire ────────────────────────────────────────────────────────────────
  P0300: { en: 'Random/Multiple Cylinder Misfire Detected', ka: 'შემთხვევითი ან მრავალი ცილინდრის ანთების გაცდენა' },
  P0301: { en: 'Cylinder 1 Misfire Detected', ka: '1-ლი ცილინდრის ანთების გაცდენა' },
  P0302: { en: 'Cylinder 2 Misfire Detected', ka: 'მე-2 ცილინდრის ანთების გაცდენა' },
  P0303: { en: 'Cylinder 3 Misfire Detected', ka: 'მე-3 ცილინდრის ანთების გაცდენა' },
  P0304: { en: 'Cylinder 4 Misfire Detected', ka: 'მე-4 ცილინდრის ანთების გაცდენა' },
  P0305: { en: 'Cylinder 5 Misfire Detected', ka: 'მე-5 ცილინდრის ანთების გაცდენა' },
  P0306: { en: 'Cylinder 6 Misfire Detected', ka: 'მე-6 ცილინდრის ანთების გაცდენა' },
  P0307: { en: 'Cylinder 7 Misfire Detected', ka: 'მე-7 ცილინდრის ანთების გაცდენა' },
  P0308: { en: 'Cylinder 8 Misfire Detected', ka: 'მე-8 ცილინდრის ანთების გაცდენა' },

  // ── Ignition / Crank / Cam ─────────────────────────────────────────────────
  P0320: { en: 'Ignition/Distributor Engine Speed Input Circuit', ka: 'ანთების/დისტრიბუტორის სიჩქარის სენსორის წრე' },
  P0325: { en: 'Knock Sensor 1 Circuit Malfunction (Bank 1)', ka: 'დარტყმის სენსორი 1 — წრის გაუმართაობა (ბანკი 1)' },
  P0326: { en: 'Knock Sensor 1 Circuit Range/Performance', ka: 'დარტყმის სენსორი 1 — მუშაობის დიაპაზონი' },
  P0330: { en: 'Knock Sensor 2 Circuit Malfunction (Bank 2)', ka: 'დარტყმის სენსორი 2 — წრის გაუმართაობა (ბანკი 2)' },
  P0335: { en: 'Crankshaft Position Sensor A Circuit Malfunction', ka: 'კოლოფკის ბრუნვის სენსორი A — წრის გაუმართაობა' },
  P0336: { en: 'Crankshaft Position Sensor A Range/Performance', ka: 'კოლოფკის ბრუნვის სენსორი A — მუშაობის დიაპაზონი' },
  P0340: { en: 'Camshaft Position Sensor A Circuit Malfunction', ka: 'გამომრთველი ლილვის სენსორი A — წრის გაუმართაობა' },
  P0341: { en: 'Camshaft Position Sensor A Range/Performance', ka: 'გამომრთველი ლილვის სენსორი A — მუშაობის დიაპაზონი' },
  P0345: { en: 'Camshaft Position Sensor A Circuit Malfunction (Bank 2)', ka: 'გამომრთველი ლილვის სენსორი A — გაუმართაობა (ბანკი 2)' },

  // ── EGR / Secondary Air ────────────────────────────────────────────────────
  P0400: { en: 'Exhaust Gas Recirculation Flow Malfunction', ka: 'გამონაბოლქვის რეცირკულაციის (EGR) ნაკადის გაუმართაობა' },
  P0401: { en: 'EGR Insufficient Flow Detected', ka: 'EGR — ნაკადი არასაკმარისია' },
  P0402: { en: 'EGR Excessive Flow Detected', ka: 'EGR — ნაკადი ზედმეტია' },
  P0411: { en: 'Secondary Air Injection Incorrect Flow', ka: 'დამხმარე ჰაერის ინჟექცია — არასწორი ნაკადი' },

  // ── Catalyst ───────────────────────────────────────────────────────────────
  P0420: { en: 'Catalyst System Efficiency Below Threshold (Bank 1)', ka: 'კატალიზური სისტემის ეფექტიანობა დაბალია (ბანკი 1)' },
  P0421: { en: 'Warm Up Catalyst Efficiency Below Threshold (Bank 1)', ka: 'კატალიზატორის გათბობის ეფექტიანობა დაბალია (ბანკი 1)' },
  P0430: { en: 'Catalyst System Efficiency Below Threshold (Bank 2)', ka: 'კატალიზური სისტემის ეფექტიანობა დაბალია (ბანკი 2)' },
  P0431: { en: 'Warm Up Catalyst Efficiency Below Threshold (Bank 2)', ka: 'კატალიზატორის გათბობის ეფექტიანობა დაბალია (ბანკი 2)' },

  // ── EVAP ───────────────────────────────────────────────────────────────────
  P0440: { en: 'Evaporative Emission Control System Malfunction', ka: 'აორთქლებითი ემისიის კონტროლის სისტემა — გაუმართაობა' },
  P0441: { en: 'Evaporative Emission System Incorrect Purge Flow', ka: 'EVAP სისტემა — არასწორი გაწმენდის ნაკადი' },
  P0442: { en: 'Evaporative Emission System Leak Detected (Small)', ka: 'EVAP სისტემა — პატარა გაჟონვა' },
  P0443: { en: 'Evaporative Emission Canister Purge Control Circuit', ka: 'EVAP კონდენსატორის გაწმენდის კონტროლის წრე' },
  P0446: { en: 'Evaporative Emission System Vent Control Circuit', ka: 'EVAP სისტემის სავენტილაციო კონტროლის წრე' },
  P0455: { en: 'Evaporative Emission System Leak Detected (Large)', ka: 'EVAP სისტემა — დიდი გაჟონვა' },
  P0456: { en: 'Evaporative Emission System Leak Detected (Very Small)', ka: 'EVAP სისტემა — ძალიან პატარა გაჟონვა' },

  // ── Speed / Idle Control ───────────────────────────────────────────────────
  P0500: { en: 'Vehicle Speed Sensor Malfunction', ka: 'სატრანსპორტო საშუალების სიჩქარის სენსორი — გაუმართაობა' },
  P0501: { en: 'Vehicle Speed Sensor Range/Performance', ka: 'სიჩქარის სენსორი — მუშაობის დიაპაზონი' },
  P0505: { en: 'Idle Control System Malfunction', ka: 'ნეიტრალური სვლის კონტროლის სისტემა — გაუმართაობა' },
  P0506: { en: 'Idle Control System RPM Lower Than Expected', ka: 'ნეიტრალური სვლა — ბრ./წთ. დაბალია' },
  P0507: { en: 'Idle Control System RPM Higher Than Expected', ka: 'ნეიტრალური სვლა — ბრ./წთ. მაღალია' },

  // ── PCM / Voltage ──────────────────────────────────────────────────────────
  P0560: { en: 'System Voltage Malfunction', ka: 'სისტემის ძაბვა — გაუმართაობა' },
  P0562: { en: 'System Voltage Low', ka: 'სისტემის ძაბვა — დაბალია' },
  P0563: { en: 'System Voltage High', ka: 'სისტემის ძაბვა — მაღალია' },
  P0600: { en: 'Serial Communication Link Malfunction', ka: 'სერიული საკომუნიკაციო კავშირი — გაუმართაობა' },
  P0601: { en: 'Internal Control Module Memory Check Sum Error', ka: 'PCM — მეხსიერების შეცდომა' },
  P0602: { en: 'Control Module Programming Error', ka: 'PCM — პროგრამირების შეცდომა' },
  P0603: { en: 'Internal Control Module Keep Alive Memory Error', ka: 'PCM — KAM მეხსიერების შეცდომა' },
  P0604: { en: 'Internal Control Module RAM Error', ka: 'PCM — RAM-ის შეცდომა' },
  P0606: { en: 'PCM Processor Fault', ka: 'PCM — პროცესორის გაუმართაობა' },

  // ── Transmission ──────────────────────────────────────────────────────────
  P0700: { en: 'Transmission Control System Malfunction', ka: 'გადაცემათა კოლოფის მართვის სისტემა — გაუმართაობა' },
  P0705: { en: 'Transmission Range Sensor Circuit Malfunction', ka: 'გადაცემათა კოლოფის დიაპაზონის სენსორი — წრე' },
  P0711: { en: 'Transmission Fluid Temperature Sensor Circuit', ka: 'გადაცემათა კოლოფის ზეთის ტემპ. სენსორი — წრე' },
  P0720: { en: 'Output Speed Sensor Circuit Malfunction', ka: 'გამომავალი სიჩქარის სენსორი — წრის გაუმართაობა' },
  P0730: { en: 'Incorrect Gear Ratio', ka: 'გადაცემათა კოლოფი — მცდარი გადაცემის თანაფარდობა' },
  P0740: { en: 'Torque Converter Clutch Circuit Malfunction', ka: 'ჰიდროტრანსფორმატორის კავშირის წრე — გაუმართაობა' },
  P0750: { en: 'Shift Solenoid A Malfunction', ka: 'გადართვის სოლენოიდი A — გაუმართაობა' },
  P0755: { en: 'Shift Solenoid B Malfunction', ka: 'გადართვის სოლენოიდი B — გაუმართაობა' },

  // ── Body / Network SAE generics ────────────────────────────────────────────
  B0001: { en: 'Air Bag Deployment Control', ka: 'უსაფრთხოების ბალიშის გაშლის კონტროლი' },
  C0035: { en: 'Left Front Wheel Speed Sensor Circuit', ka: 'მარცხენა წინა თვლის სიჩქარის სენსორი — წრე' },
  C0040: { en: 'Right Front Wheel Speed Sensor Circuit', ka: 'მარჯვენა წინა თვლის სიჩქარის სენსორი — წრე' },
  C0045: { en: 'Left Rear Wheel Speed Sensor Circuit', ka: 'მარცხენა უკანა თვლის სიჩქარის სენსორი — წრე' },
  C0050: { en: 'Right Rear Wheel Speed Sensor Circuit', ka: 'მარჯვენა უკანა თვლის სიჩქარის სენსორი — წრე' },
  U0001: { en: 'High Speed CAN Communication Bus', ka: 'CAN კომუნიკაციის სწრაფი სალტე' },
  U0100: { en: 'Lost Communication With ECM/PCM', ka: 'ECM/PCM-თან კომუნიკაცია დაიკარგა' },
  U0155: { en: 'Lost Communication With Instrument Panel Control Module', ka: 'საბორტო პანელთან კომუნიკაცია დაიკარგა' },
} as const;

export function getDtcDescription(code: string, locale: DtcLocale): string | undefined {
  const upper = code.trim().toUpperCase();
  const entry = SAE_DESCRIPTIONS[upper];
  return entry?.[locale];
}

export function isSaeGenericCode(code: string): boolean {
  const upper = code.trim().toUpperCase();
  return upper in SAE_DESCRIPTIONS;
}
