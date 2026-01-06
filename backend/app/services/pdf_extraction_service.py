"""PDF property listing extraction service."""

import pdfplumber
import os
import re
import json
from typing import Optional, Dict
from datetime import datetime
from app.models.scraping_models import PropertyData, ScrapingResult
try:
    from anthropic import Anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False


class PDFExtractionError(Exception):
    """Base exception for PDF extraction errors."""
    pass


class PDFParseError(PDFExtractionError):
    """Raised when PDF parsing fails."""
    pass


class PDFExtractionService:
    """Service for extracting property data from PDF listing documents."""

    def __init__(self):
        """Initialize PDF extraction service."""
        self.anthropic_api_key = os.getenv('ANTHROPIC_API_KEY')
        if self.anthropic_api_key and ANTHROPIC_AVAILABLE:
            self.anthropic_client = Anthropic(api_key=self.anthropic_api_key)
            self.use_llm = True
        else:
            self.anthropic_client = None
            self.use_llm = False

    def extract_from_pdf(self, pdf_path: str) -> ScrapingResult:
        """
        Extract property data from a PDF file.

        Args:
            pdf_path: Path to the PDF file

        Returns:
            ScrapingResult object with extracted data
        """
        try:
            # Extract text from PDF
            pdf_text = self._extract_text_from_pdf(pdf_path)

            if not pdf_text or len(pdf_text.strip()) < 50:
                return ScrapingResult(
                    status='failed',
                    error_type='PARSE_ERROR',
                    error_message='Could not extract sufficient text from PDF',
                    suggested_action='Please ensure the PDF contains readable text and is not an image-only scan',
                    confidence_score=0.0,
                    method='pdf_extraction',
                    source_platform='pdf_upload'
                )

            # Extract structured data
            if self.use_llm:
                property_data = self._extract_with_llm(pdf_text)
                confidence = 0.85  # Higher confidence with LLM
            else:
                property_data = self._extract_with_regex(pdf_text)
                confidence = 0.65  # Lower confidence with regex

            # Determine status
            if property_data and (property_data.address or property_data.asking_price):
                status = 'success'
                error_type = None
                error_message = None
            else:
                status = 'partial'
                error_type = 'INCOMPLETE_DATA'
                error_message = 'Some property fields could not be extracted'

            return ScrapingResult(
                status=status,
                extracted_data=property_data,
                confidence_score=confidence,
                method='pdf_llm_extraction' if self.use_llm else 'pdf_regex_extraction',
                source_platform='pdf_upload',
                error_type=error_type,
                error_message=error_message,
                missing_fields=self._get_missing_fields(property_data) if property_data else [],
                warnings=['Please review and verify all extracted data for accuracy']
            )

        except PDFExtractionError as e:
            return ScrapingResult(
                status='failed',
                error_type='EXTRACTION_ERROR',
                error_message=str(e),
                suggested_action='Please verify the PDF file is valid and contains property listing information',
                confidence_score=0.0,
                method='pdf_extraction',
                source_platform='pdf_upload'
            )
        except Exception as e:
            print(f"Unexpected error in PDF extraction: {str(e)}")
            return ScrapingResult(
                status='failed',
                error_type='UNKNOWN_ERROR',
                error_message='An unexpected error occurred while processing the PDF',
                suggested_action='Please try again or contact support if the issue persists',
                confidence_score=0.0,
                method='pdf_extraction',
                source_platform='pdf_upload'
            )

    def _extract_text_from_pdf(self, pdf_path: str) -> str:
        """Extract raw text from PDF file."""
        try:
            text_parts = []
            with pdfplumber.open(pdf_path) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text_parts.append(page_text)

            full_text = '\n'.join(text_parts)
            return full_text

        except Exception as e:
            raise PDFParseError(f"Failed to parse PDF: {str(e)}")

    def _extract_with_llm(self, pdf_text: str) -> Optional[PropertyData]:
        """Use Claude API to extract structured data from PDF text."""
        if not self.anthropic_client:
            return self._extract_with_regex(pdf_text)

        try:
            # Construct prompt for Claude
            prompt = f"""Extract property listing information from the following text and return it as a JSON object.

Text:
{pdf_text[:15000]}  # Limit to avoid token limits

Please extract the following fields if available:
- address (full street address)
- city
- state
- zipcode
- propertyName
- propertyType (e.g., "Multifamily", "Office", "Retail")
- askingPrice (as a number)
- pricePerUnit (as a number)
- buildingSizeSf (building size in square feet, as a number)
- lotSizeAc (lot size in acres, as a number)
- numUnits (number of units, as an integer)
- bedrooms (number of bedrooms, as an integer)
- bathrooms (number of bathrooms, as a number)
- yearBuilt (as an integer)
- capRate (as a number, percentage)
- noi (net operating income, as a number)
- grossIncome (as a number)
- parkingSpaces (as an integer)
- parkingRatio (as a number)
- occupancy (as a number, percentage)
- daysOnMarket (as an integer)
- listingId
- latitude (as a number)
- longitude (as a number)

Return ONLY a valid JSON object with these fields. Use null for any fields that are not found.
Do not include any explanation or additional text."""

            message = self.anthropic_client.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=2048,
                messages=[{
                    "role": "user",
                    "content": prompt
                }]
            )

            # Parse response
            response_text = message.content[0].text.strip()

            # Remove markdown code blocks if present
            if response_text.startswith('```'):
                response_text = re.sub(r'^```json?\s*', '', response_text)
                response_text = re.sub(r'\s*```$', '', response_text)

            # Parse JSON
            data = json.loads(response_text)

            # Create PropertyData object
            return PropertyData.from_dict(data)

        except Exception as e:
            print(f"LLM extraction error: {str(e)}")
            # Fallback to regex extraction
            return self._extract_with_regex(pdf_text)

    def _extract_with_regex(self, pdf_text: str) -> Optional[PropertyData]:
        """Extract data using regex patterns (fallback method)."""
        data = PropertyData()

        # Price patterns
        price_pattern = r'\$\s*([0-9,]+(?:\.[0-9]{2})?)\s*(?:USD|Price)?'
        price_matches = re.findall(price_pattern, pdf_text)
        if price_matches:
            # Get the largest price (likely asking price)
            prices = [float(p.replace(',', '')) for p in price_matches]
            data.asking_price = max(prices)

        # Units pattern
        units_pattern = r'(\d+)\s*[Uu]nit'
        units_match = re.search(units_pattern, pdf_text)
        if units_match:
            data.num_units = int(units_match.group(1))

        # Cap rate pattern
        cap_rate_pattern = r'(\d+\.?\d*)\s*%?\s*[Cc]ap\s*[Rr]ate'
        cap_match = re.search(cap_rate_pattern, pdf_text)
        if cap_match:
            data.cap_rate = float(cap_match.group(1))

        # Square footage pattern
        sf_pattern = r'([0-9,]+)\s*[Ss][Ff]|[Ss]quare\s*[Ff]eet'
        sf_match = re.search(sf_pattern, pdf_text)
        if sf_match:
            data.building_size_sf = float(sf_match.group(1).replace(',', ''))

        # Year built pattern
        year_pattern = r'[Yy]ear\s*[Bb]uilt:?\s*(\d{4})|[Bb]uilt\s*in\s*(\d{4})|(\d{4})\s*[Bb]uilt'
        year_match = re.search(year_pattern, pdf_text)
        if year_match:
            year = year_match.group(1) or year_match.group(2) or year_match.group(3)
            data.year_built = int(year)

        # Address pattern (basic)
        address_pattern = r'(\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct))'
        address_match = re.search(address_pattern, pdf_text)
        if address_match:
            data.address = address_match.group(1)

        # City, State, ZIP pattern
        location_pattern = r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2})\s+(\d{5})'
        location_match = re.search(location_pattern, pdf_text)
        if location_match:
            data.city = location_match.group(1)
            data.state = location_match.group(2)
            data.zipcode = location_match.group(3)

        # Property type patterns
        if re.search(r'[Mm]ultifamily|[Aa]partment', pdf_text):
            data.property_type = 'Multifamily'
        elif re.search(r'[Oo]ffice', pdf_text):
            data.property_type = 'Office'
        elif re.search(r'[Rr]etail', pdf_text):
            data.property_type = 'Retail'
        elif re.search(r'[Ii]ndustrial', pdf_text):
            data.property_type = 'Industrial'

        return data if (data.address or data.asking_price) else None

    def _get_missing_fields(self, data: PropertyData) -> list:
        """Identify which critical fields are missing."""
        missing = []
        critical_fields = {
            'address': data.address,
            'city': data.city,
            'state': data.state,
            'askingPrice': data.asking_price,
            'numUnits': data.num_units,
            'buildingSizeSf': data.building_size_sf
        }

        for field_name, field_value in critical_fields.items():
            if not field_value:
                missing.append(field_name)

        return missing
