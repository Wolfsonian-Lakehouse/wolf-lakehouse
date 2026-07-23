const API_BASE = 'https://lakehouse.wolfsonian.org/api/v1';

// DOM Elements
const searchForm = document.getElementById('searchForm');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const resultsTable = document.getElementById('resultsTable');
const tableBody = document.getElementById('tableBody');
const loadingIndicator = document.getElementById('loadingIndicator');
const noResults = document.getElementById('noResults');
const paginationControls = document.getElementById('paginationControls');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const pageInfo = document.getElementById('pageInfo');

// Modal Elements
const recordModal = document.getElementById('recordModal');
const closeModalBtn = document.getElementById('closeModal');
const modalGrid = document.getElementById('modalGrid');
const modalTitle = document.getElementById('modalTitle');

// State
let currentQuery = '';
let currentOffset = 0;
const LIMIT = 50;
let currentData = [];

// Event Listeners
searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    currentQuery = searchInput.value.trim();
    currentOffset = 0;
    fetchData();
});

prevBtn.addEventListener('click', () => {
    if (currentOffset >= LIMIT) {
        currentOffset -= LIMIT;
        fetchData();
    }
});

nextBtn.addEventListener('click', () => {
    currentOffset += LIMIT;
    fetchData();
});

closeModalBtn.addEventListener('click', closeModal);
recordModal.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) {
        closeModal();
    }
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !recordModal.classList.contains('hidden')) {
        closeModal();
    }
});

// Load initial data
document.addEventListener('DOMContentLoaded', () => {
    fetchData();
});

// API Fetching
async function fetchData() {
    // UI Loading state
    resultsTable.classList.add('hidden');
    noResults.classList.add('hidden');
    paginationControls.classList.add('hidden');
    loadingIndicator.classList.remove('hidden');
    searchBtn.disabled = true;

    try {
        let url;
        if (currentQuery) {
            url = `${API_BASE}/search?q=${encodeURIComponent(currentQuery)}&limit=${LIMIT}&offset=${currentOffset}`;
        } else {
            url = `${API_BASE}/aa_good_lookup?limit=${LIMIT}&offset=${currentOffset}`;
        }

        const response = await fetch(url);
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        
        const data = await response.json();
        currentData = data.data || [];
        
        renderTable(currentData);
        updatePagination(currentData.length);
    } catch (error) {
        console.error("Error fetching Lakehouse data:", error);
        tableBody.innerHTML = '';
        noResults.innerHTML = `<p style="color: #ff6b6b">Error fetching data. Ensure the API is reachable.</p>`;
        noResults.classList.remove('hidden');
    } finally {
        loadingIndicator.classList.add('hidden');
        searchBtn.disabled = false;
    }
}

// Rendering
function renderTable(data) {
    if (data.length === 0) {
        noResults.classList.remove('hidden');
        return;
    }

    tableBody.innerHTML = '';
    
    data.forEach((record, index) => {
        // Fallbacks for different endpoint structures
        const id = record['ID (Node ID)'] || record.id || 'N/A';
        const accession = record['Accession Number'] || record.field_identifier || 'N/A';
        const title = record['Title'] || record.title || 'Untitled';
        const creator = record['Creator'] || record.field_linked_agent || 'Unknown';
        const date = record['Date'] || record.field_edtf_date_created || 'Unknown';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${accession}</strong></td>
            <td>${title.substring(0, 60)}${title.length > 60 ? '...' : ''}</td>
            <td>${creator.substring(0, 40)}${creator.length > 40 ? '...' : ''}</td>
            <td>${date}</td>
            <td><button class="view-btn" data-index="${index}">View Details</button></td>
        `;
        tableBody.appendChild(tr);
    });

    // Attach view listeners
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = e.target.getAttribute('data-index');
            openModal(currentData[index]);
        });
    });

    resultsTable.classList.remove('hidden');
}

function updatePagination(loadedCount) {
    if (currentOffset === 0 && loadedCount < LIMIT) {
        // Only one page of results
        paginationControls.classList.add('hidden');
        return;
    }

    paginationControls.classList.remove('hidden');
    
    const currentPage = (currentOffset / LIMIT) + 1;
    pageInfo.textContent = `Page ${currentPage}`;
    
    prevBtn.disabled = currentOffset === 0;
    nextBtn.disabled = loadedCount < LIMIT; // Disable next if we loaded less than limit (end of results)
}

function openModal(record) {
    modalGrid.innerHTML = '';
    
    // Set title
    modalTitle.textContent = record['Title'] || record.title || 'Artifact Details';

    // Populate grid
    for (const [key, value] of Object.entries(record)) {
        if (!value || key === 'Title' || key === 'title') continue; // Skip empty and title

        const fieldDiv = document.createElement('div');
        fieldDiv.className = 'record-field';
        
        // Format key (if from search endpoint, format snake_case)
        const displayKey = key.includes('_') 
            ? key.replace(/^field_/, '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
            : key;

        fieldDiv.innerHTML = `
            <div class="field-label">${displayKey}</div>
            <div class="field-value">${value}</div>
        `;
        modalGrid.appendChild(fieldDiv);
    }

    recordModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden'; // Prevent scrolling background
}

function closeModal() {
    recordModal.classList.add('hidden');
    document.body.style.overflow = '';
}
