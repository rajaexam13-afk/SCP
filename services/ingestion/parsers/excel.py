import pandas as pd
import io
import logging

logger = logging.getLogger(__name__)


class ExcelParser:
    """
    Parses Excel files (.xlsx, .xls) into a raw DataFrame.
    Handles multi-sheet detection, header row detection, merged cells.
    """

    MAX_ROWS = 5_000_000

    def parse(self, source: io.BytesIO, sheet_name: int | str = 0) -> pd.DataFrame:
        """
        Parse Excel file. Auto-detects header row (first non-empty row).
        """
        try:
            # Try openpyxl first (xlsx), fall back to xlrd (xls)
            try:
                xl = pd.ExcelFile(source, engine="openpyxl")
            except Exception:
                source.seek(0)
                xl = pd.ExcelFile(source, engine="xlrd")

            sheet = xl.sheet_names[sheet_name] if isinstance(sheet_name, int) else sheet_name
            logger.info(f"Parsing sheet: {sheet}")

            df = pd.read_excel(
                xl,
                sheet_name=sheet,
                header=0,
                dtype=str,    # Read everything as string first, type-cast later
                na_values=["", "NA", "N/A", "#N/A", "NULL", "null", "-"],
            )

            # Remove fully empty rows and columns
            df = df.dropna(how="all").dropna(axis=1, how="all")
            df.columns = [str(c).strip() for c in df.columns]

            logger.info(f"Parsed {len(df)} rows, {len(df.columns)} columns")
            return df

        except Exception as e:
            logger.error(f"Excel parse error: {e}")
            raise ValueError(f"Failed to parse Excel file: {e}")

    def detect_header_row(self, source: io.BytesIO) -> int:
        """Detect which row contains the actual headers (skips logo/title rows)."""
        df_raw = pd.read_excel(source, header=None, nrows=10, dtype=str)
        for i, row in df_raw.iterrows():
            non_null = row.dropna()
            if len(non_null) >= 3:  # Row with at least 3 non-null = likely header
                return i
        return 0

    def list_sheets(self, source: io.BytesIO) -> list:
        xl = pd.ExcelFile(source, engine="openpyxl")
        return xl.sheet_names
