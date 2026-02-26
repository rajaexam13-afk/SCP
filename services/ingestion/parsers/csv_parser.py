import pandas as pd
import io
import chardet
import logging

logger = logging.getLogger(__name__)


class CSVParser:
    """
    Parses CSV files with automatic encoding and delimiter detection.
    """

    def parse(self, source: io.BytesIO) -> pd.DataFrame:
        content = source.read()

        # Detect encoding
        detected = chardet.detect(content[:50_000])
        encoding = detected.get("encoding") or "utf-8"
        logger.info(f"Detected encoding: {encoding} (confidence: {detected.get('confidence', 0):.0%})")

        text = content.decode(encoding, errors="replace")

        # Detect delimiter
        delimiter = self._detect_delimiter(text)
        logger.info(f"Detected delimiter: repr={repr(delimiter)}")

        df = pd.read_csv(
            io.StringIO(text),
            sep=delimiter,
            dtype=str,
            na_values=["", "NA", "N/A", "#N/A", "NULL", "null", "-"],
            encoding_errors="replace",
        )

        df = df.dropna(how="all").dropna(axis=1, how="all")
        df.columns = [str(c).strip() for c in df.columns]

        logger.info(f"Parsed {len(df)} rows, {len(df.columns)} columns")
        return df

    def _detect_delimiter(self, text: str) -> str:
        """Detect CSV delimiter by counting occurrences in header line."""
        header = text.split("\n")[0]
        candidates = {",": 0, ";": 0, "\t": 0, "|": 0}
        for delim in candidates:
            candidates[delim] = header.count(delim)
        return max(candidates, key=candidates.get)
