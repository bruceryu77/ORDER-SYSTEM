/** Google Sheet + Drive settings */
window.APP_CONFIG = {
  /** Tester order sheet (COLORSILK / ECOCO / FANTASIA / GILLETTE / YARDLEY) */
  SHEET_ID: "1yFxGDo25r-efhMZEUvM6ZHKKXr1dBX0tQC7Y_TuV2DY",
  /** First sheet tab. Change if your data is on another tab. */
  SHEET_GID: "0",
  DRIVE_FOLDER_ID: "1u3iqOZgoGRe7foBPUNiGnsAPeFxaIZuA",
  /**
   * Optional Google Cloud API key (enable Drive API + Sheets API).
   * Recommended for reliable photo refresh when adding new Drive files.
   */
  GOOGLE_API_KEY: ""
};

/**
 * Drive images: filename must equal the Google Sheet item name + .jpg
 * Example:
 *   Sheet item: COLORSILK 03 ULT/LT SUN BLONDE
 *   File name:  COLORSILK 03 ULT/LT SUN BLONDE.jpg
 *
 * GitHub Actions updates this fallback list and images-map.json automatically.
 * The app loads the latest images-map.json without browser cache.
 */
window.DRIVE_IMAGES = [
  { id: "12GCSXPkBBiNvi2U1uroosxWVyvIJ66LF", name: "COLORSILK 03 ULT/LT SUN BLONDE.jpg" },
  { id: "1ToGZV-rUD20WcvEgbPsfyDmuEId7eHCH", name: "COLORSILK 10 BLACK.gif" },
  { id: "1HdvbFwKkEBvcikbLCi_fsECp9h9fzyDL", name: "COLORSILK 11 SOFT BLACK.gif" },
  { id: "1luLfS-5-BLYvH2mLxkIofLbD7p2Yi8iR", name: "COLORSILK 12 NAT BLUE BLACK.gif" },
  { id: "1zsQjmnzkuA20Z_oh7eYQ7eTejxm5JsEZ", name: "ECOCO STYLE GEL ARGAN OIL 12OZ.jpg" },
  { id: "1mFBr54s2Be82XWQ6SMVxgoQZLJv16rjb", name: "FANTASIA NATURALS CBD SRM 4OZ.jpg" },
  { id: "1xQlSuMpWMdWrR5t11fI-t-D4vkuKsWMS", name: "GIL CUST PL 10+2 SENS3 PIV.jpg" },
  { id: "1Ywx_7bw4F4JrDi3NFqXVHyBzhwxk5Efx", name: "RK ONE STEP GEL TOP COAT.gif" },
  { id: "1F6PknKr4KLJQw0h9AeX4ll8arRvVSdX0", name: "RK ONE STEP GEL WHITE.jpg" },
  { id: "1nPVdal3hv_16npOMv71xwtE18Lf0z-1L", name: "YARDLEY 1X4.25 BAR ACTIVATED CHARCOAL.jpg" },
  { id: "1PWzdqaKnCr7lioX3d7Yk0htmY8VSrMng", name: "YARDLEY 1X4.25 BAR COCOA BUTTER.gif" },
  { id: "14uHIaSt4_84Ga-YsjEN47A8j8fEMIA-t", name: "YARDLEY 1X4.25 BAR CREAMY COCONUT.gif" }
];
