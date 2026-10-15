class ApiError(Exception):
    """Raised anywhere in a request; turned into a JSON error response."""

    def __init__(self, message, status=400):
        super().__init__(message)
        self.message, self.status = message, status
