// Display attendance data in the default table
function displayAttendance(data) {
    const tbody = document.querySelector('#attendance-table tbody');
    tbody.innerHTML = ''; // Clear existing rows

    // Use a Set to track unique names
    const uniqueNames = new Set();

    data.forEach(record => {
        // Check if the name has already been added to the table
        if (!uniqueNames.has(record.Name)) {
            uniqueNames.add(record.Name); // Add the name to the Set

            // Create a new row for the table
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${record.Name}</td>
                <td>${record['Roll Number']}</td>
                <td>${record.Department}</td>
                <td>${record.Timestamp}</td>
            `;
            tbody.appendChild(row);
        }
    });
}