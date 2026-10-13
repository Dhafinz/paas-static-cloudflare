/**
 * PaaS Cloud Resource Manager - Modern CRUD Application
 * Persistensi: IndexedDB dengan sinkronisasi cadangan LocalStorage.
 * Mendukung siklus penuh Create, Read, Update, Delete & Otomatisasi Diagnostik.
 */

// --- 1. Database Layer (IndexedDB Engine) ---
class PaaSStorageEngine {
  constructor(dbName = 'PaaSResourcesDB', version = 1) {
    this.dbName = dbName;
    this.version = version;
    this.db = null;
    this.storeName = 'resources';
  }

  async init() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        console.warn('IndexedDB tidak didukung pada browser ini. Menggunakan fallback localStorage.');
        resolve(null);
        return;
      }

      const request = indexedDB.open(this.dbName, this.version);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('name', 'name', { unique: false });
          store.createIndex('type', 'type', { unique: false });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('Error saat inisialisasi IndexedDB:', event.target.error);
        resolve(null); // fallback gracefully
      };
    });
  }

  // Helper Fallback LocalStorage
  _getLocalStorageData() {
    try {
      const raw = localStorage.getItem('paas_resources_backup');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  _setLocalStorageData(items) {
    try {
      localStorage.setItem('paas_resources_backup', JSON.stringify(items));
    } catch (e) {
      console.error('Gagal menulis ke localStorage:', e);
    }
  }

  // READ ALL
  async getAll() {
    if (!this.db) {
      return this._getLocalStorageData();
    }
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result || [];
        this._setLocalStorageData(results); // keep backup in sync
        resolve(results);
      };
      request.onerror = () => {
        resolve(this._getLocalStorageData());
      };
    });
  }

  // READ ONE
  async getById(id) {
    if (!this.db) {
      const items = this._getLocalStorageData();
      return items.find((item) => item.id === id) || null;
    }
    return new Promise((resolve) => {
      const tx = this.db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  }

  // CREATE
  async create(resourceData) {
    const item = {
      id: 'res-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      name: resourceData.name.trim(),
      type: resourceData.type,
      env: resourceData.env || 'Production',
      status: resourceData.status || 'Active',
      memory: resourceData.memory || 'N/A',
      description: resourceData.description ? resourceData.description.trim() : '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (!this.db) {
      const items = this._getLocalStorageData();
      items.push(item);
      this._setLocalStorageData(items);
      return item;
    }

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.add(item);

      request.onsuccess = () => {
        // sync backup
        this.getAll();
        resolve(item);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  // UPDATE
  async update(id, updateData) {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`Resource dengan ID "${id}" tidak ditemukan.`);
    }

    const updatedItem = {
      ...existing,
      ...updateData,
      id, // protect ID integrity
      updatedAt: new Date().toISOString()
    };

    if (!this.db) {
      const items = this._getLocalStorageData();
      const idx = items.findIndex((i) => i.id === id);
      if (idx !== -1) items[idx] = updatedItem;
      this._setLocalStorageData(items);
      return updatedItem;
    }

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.put(updatedItem);

      request.onsuccess = () => {
        this.getAll();
        resolve(updatedItem);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  // DELETE
  async delete(id) {
    if (!this.db) {
      let items = this._getLocalStorageData();
      items = items.filter((i) => i.id !== id);
      this._setLocalStorageData(items);
      return true;
    }

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const request = store.delete(id);

      request.onsuccess = () => {
        this.getAll();
        resolve(true);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  // SEED INITIAL DATA IF EMPTY
  async seedInitialDataIfEmpty() {
    const existing = await this.getAll();
    if (existing.length === 0) {
      const demoData = [
        {
          name: 'auth-jwt-worker',
          type: 'Worker',
          env: 'Production',
          status: 'Active',
          memory: '128 MB',
          description: 'Edge authentication middleware dan verifikasi token OAuth Cloudflare.'
        },
        {
          name: 'user-profile-d1',
          type: 'Database',
          env: 'Production',
          status: 'Active',
          memory: '500 MB',
          description: 'Cloudflare D1 SQL database untuk penyimpanan profil pengguna dan hak akses.'
        },
        {
          name: 'session-cache-kv',
          type: 'Storage',
          env: 'Staging',
          status: 'Active',
          memory: '1 GB',
          description: 'Cloudflare KV Namespace untuk cache sesi pengguna terdistribusi global.'
        },
        {
          name: 'paas-static-frontend',
          type: 'Static Asset',
          env: 'Production',
          status: 'Active',
          memory: '15 MB',
          description: 'Aplikasi dashboard statis yang di-deploy via Cloudflare Static Assets.'
        }
      ];

      for (const item of demoData) {
        await this.create(item);
      }
      return true;
    }
    return false;
  }

  // RESET TO DEMO DATA
  async resetToDemo() {
    if (this.db) {
      const tx = this.db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      store.clear();
      await new Promise((res) => { tx.oncomplete = res; });
    }
    this._setLocalStorageData([]);
    await this.seedInitialDataIfEmpty();
    return true;
  }
}

// --- 2. Application UI Controller ---
class PaaSAppController {
  constructor() {
    this.db = new PaaSStorageEngine();
    this.resources = [];
    this.deleteTargetId = null;

    // Elements
    this.elements = {
      tableBody: document.getElementById('resourcesTableBody'),
      emptyState: document.getElementById('emptyState'),
      searchInput: document.getElementById('searchInput'),
      filterType: document.getElementById('filterType'),
      filterStatus: document.getElementById('filterStatus'),
      sortBy: document.getElementById('sortBy'),
      btnOpenAddModal: document.getElementById('btnOpenAddModal'),
      btnEmptyAdd: document.getElementById('btnEmptyAdd'),
      btnResetData: document.getElementById('btnResetData'),
      btnRunDiagnostics: document.getElementById('btnRunDiagnostics'),

      // Modal Form
      resourceModal: document.getElementById('resourceModal'),
      resourceForm: document.getElementById('resourceForm'),
      modalTitle: document.getElementById('modalTitle'),
      resourceId: document.getElementById('resourceId'),
      resourceName: document.getElementById('resourceName'),
      resourceType: document.getElementById('resourceType'),
      resourceEnv: document.getElementById('resourceEnv'),
      resourceStatus: document.getElementById('resourceStatus'),
      resourceMemory: document.getElementById('resourceMemory'),
      resourceDescription: document.getElementById('resourceDescription'),
      btnCloseModal: document.getElementById('btnCloseModal'),
      btnCancelModal: document.getElementById('btnCancelModal'),
      btnSaveResource: document.getElementById('btnSaveResource'),
      btnSaveText: document.getElementById('btnSaveText'),

      // Modal Delete
      deleteModal: document.getElementById('deleteModal'),
      deleteTargetName: document.getElementById('deleteTargetName'),
      btnCloseDeleteModal: document.getElementById('btnCloseDeleteModal'),
      btnCancelDelete: document.getElementById('btnCancelDelete'),
      btnConfirmDelete: document.getElementById('btnConfirmDelete'),

      // Diagnostics Modal
      diagnosticsModal: document.getElementById('diagnosticsModal'),
      diagnosticsList: document.getElementById('diagnosticsList'),
      diagnosticsSummary: document.getElementById('diagnosticsSummary'),
      btnCloseDiagnostics: document.getElementById('btnCloseDiagnostics'),
      btnReRunDiagnostics: document.getElementById('btnReRunDiagnostics'),
      btnDoneDiagnostics: document.getElementById('btnDoneDiagnostics'),

      // Metrics
      metricTotal: document.getElementById('metricTotal'),
      metricActive: document.getElementById('metricActive'),
      metricDatabases: document.getElementById('metricDatabases'),
      metricWorkers: document.getElementById('metricWorkers'),

      // Status Indicator
      dbStatusLabel: document.getElementById('dbStatusLabel'),
      toastContainer: document.getElementById('toastContainer')
    };
  }

  async start() {
    try {
      await this.db.init();
      await this.db.seedInitialDataIfEmpty();
      this.attachEventListeners();
      await this.loadAndRender();
      this.showToast('Database persistent terhubung.', 'info');
    } catch (err) {
      console.error('Gagal memulai aplikasi:', err);
      this.showToast('Gagal memuat database: ' + err.message, 'danger');
    }
  }

  attachEventListeners() {
    // Cloudflare Verification Button
    const cekBtn = document.getElementById('cek');
    const hasilEl = document.getElementById('hasil');
    if (cekBtn && hasilEl) {
      cekBtn.addEventListener('click', () => {
        hasilEl.textContent = 'JavaScript berhasil dijalankan di Cloudflare Workers!';
        hasilEl.style.color = '#34d399';
        this.showToast('Cek JavaScript: Berhasil dieksekusi!', 'success');
      });
    }

    // Search & Filters
    this.elements.searchInput.addEventListener('input', () => this.renderTable());
    this.elements.filterType.addEventListener('change', () => this.renderTable());
    this.elements.filterStatus.addEventListener('change', () => this.renderTable());
    this.elements.sortBy.addEventListener('change', () => this.renderTable());

    // Modal Add
    const openAdd = () => this.openModal();
    this.elements.btnOpenAddModal.addEventListener('click', openAdd);
    this.elements.btnEmptyAdd.addEventListener('click', openAdd);

    // Modal Close
    this.elements.btnCloseModal.addEventListener('click', () => this.closeModal());
    this.elements.btnCancelModal.addEventListener('click', () => this.closeModal());

    // Form Submit (Create / Update)
    this.elements.resourceForm.addEventListener('submit', (e) => this.handleSubmit(e));

    // Delete Modal
    this.elements.btnCloseDeleteModal.addEventListener('click', () => this.closeDeleteModal());
    this.elements.btnCancelDelete.addEventListener('click', () => this.closeDeleteModal());
    this.elements.btnConfirmDelete.addEventListener('click', () => this.handleConfirmDelete());

    // Diagnostics Modal
    this.elements.btnRunDiagnostics.addEventListener('click', () => this.runDiagnostics());
    this.elements.btnReRunDiagnostics.addEventListener('click', () => this.runDiagnostics());
    this.elements.btnCloseDiagnostics.addEventListener('click', () => this.closeDiagnosticsModal());
    this.elements.btnDoneDiagnostics.addEventListener('click', () => this.closeDiagnosticsModal());

    // Reset Demo
    this.elements.btnResetData.addEventListener('click', async () => {
      if (confirm('Apakah Anda ingin mereset data ke set demo default?')) {
        await this.db.resetToDemo();
        await this.loadAndRender();
        this.showToast('Data demo berhasil dimuat ulang.', 'success');
      }
    });

    // Close on backdrop click
    window.addEventListener('click', (e) => {
      if (e.target === this.elements.resourceModal) this.closeModal();
      if (e.target === this.elements.deleteModal) this.closeDeleteModal();
      if (e.target === this.elements.diagnosticsModal) this.closeDiagnosticsModal();
    });

    // Expose diagnostics to window for automated headless evaluation
    window.runCrudDiagnostics = () => this.runDiagnostics();
  }

  async loadAndRender() {
    this.resources = await this.db.getAll();
    this.updateMetrics();
    this.renderTable();
  }

  updateMetrics() {
    const total = this.resources.length;
    const active = this.resources.filter((r) => r.status === 'Active').length;
    const databases = this.resources.filter((r) => r.type === 'Database' || r.type === 'Storage').length;
    const workers = this.resources.filter((r) => r.type === 'Worker').length;

    this.elements.metricTotal.textContent = total;
    this.elements.metricActive.textContent = active;
    this.elements.metricDatabases.textContent = databases;
    this.elements.metricWorkers.textContent = workers;
  }

  getFilteredResources() {
    const query = this.elements.searchInput.value.toLowerCase().trim();
    const typeFilter = this.elements.filterType.value;
    const statusFilter = this.elements.filterStatus.value;
    const sortBy = this.elements.sortBy.value;

    let filtered = this.resources.filter((item) => {
      const matchQuery =
        !query ||
        item.name.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query) ||
        item.type.toLowerCase().includes(query);

      const matchType = typeFilter === 'ALL' || item.type === typeFilter;
      const matchStatus = statusFilter === 'ALL' || item.status === statusFilter;

      return matchQuery && matchType && matchStatus;
    });

    // Sort
    filtered.sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.updatedAt) - new Date(a.updatedAt);
      if (sortBy === 'oldest') return new Date(a.updatedAt) - new Date(b.updatedAt);
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return 0;
    });

    return filtered;
  }

  renderTable() {
    const items = this.getFilteredResources();
    this.elements.tableBody.innerHTML = '';

    if (items.length === 0) {
      this.elements.emptyState.classList.remove('hidden');
      return;
    }

    this.elements.emptyState.classList.add('hidden');

    items.forEach((item) => {
      const tr = document.createElement('tr');
      tr.id = `row-${item.id}`;

      // Badge classes
      let typeBadgeClass = 'badge-worker';
      if (item.type === 'Database') typeBadgeClass = 'badge-database';
      else if (item.type === 'Storage') typeBadgeClass = 'badge-storage';
      else if (item.type === 'Static Asset') typeBadgeClass = 'badge-static';

      let statusBadgeClass = 'badge-status-active';
      if (item.status === 'Maintenance') statusBadgeClass = 'badge-status-maintenance';
      else if (item.status === 'Inactive') statusBadgeClass = 'badge-status-inactive';

      let envBadgeClass = 'badge-env-prod';
      if (item.env === 'Staging') envBadgeClass = 'badge-env-stage';
      else if (item.env === 'Development') envBadgeClass = 'badge-env-dev';

      const updatedTime = new Date(item.updatedAt).toLocaleString('id-ID', {
        dateStyle: 'short',
        timeStyle: 'short'
      });

      tr.innerHTML = `
        <td>
          <div class="cell-name-box">
            <span class="cell-name">${this.escapeHtml(item.name)}</span>
            <span class="cell-desc">${this.escapeHtml(item.description || item.memory || '-')}</span>
          </div>
        </td>
        <td><span class="badge ${typeBadgeClass}">${item.type}</span></td>
        <td><span class="badge ${envBadgeClass}">${item.env}</span></td>
        <td><span class="badge ${statusBadgeClass}">${item.status}</span></td>
        <td><span class="text-dim" style="font-size:0.85rem">${updatedTime}</span></td>
        <td class="text-right">
          <div class="table-actions">
            <button class="btn-icon btn-edit" data-id="${item.id}" title="Edit Resource" aria-label="Edit ${this.escapeHtml(item.name)}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
              </svg>
            </button>
            <button class="btn-icon btn-icon-delete btn-delete" data-id="${item.id}" data-name="${this.escapeHtml(item.name)}" title="Hapus Resource" aria-label="Hapus ${this.escapeHtml(item.name)}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18"/>
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
              </svg>
            </button>
          </div>
        </td>
      `;

      // Attach button events
      tr.querySelector('.btn-edit').addEventListener('click', () => this.openEditModal(item.id));
      tr.querySelector('.btn-delete').addEventListener('click', () => this.openDeleteModal(item.id, item.name));

      this.elements.tableBody.appendChild(tr);
    });
  }

  // --- Modal Form Actions ---
  openModal(item = null) {
    if (item) {
      this.elements.modalTitle.textContent = 'Edit Resource';
      this.elements.btnSaveText.textContent = 'Simpan Perubahan';
      this.elements.resourceId.value = item.id;
      this.elements.resourceName.value = item.name;
      this.elements.resourceType.value = item.type;
      this.elements.resourceEnv.value = item.env;
      this.elements.resourceStatus.value = item.status;
      this.elements.resourceMemory.value = item.memory || '';
      this.elements.resourceDescription.value = item.description || '';
    } else {
      this.elements.modalTitle.textContent = 'Tambah Resource Baru';
      this.elements.btnSaveText.textContent = 'Simpan Resource';
      this.elements.resourceForm.reset();
      this.elements.resourceId.value = '';
      this.elements.resourceType.value = 'Worker';
      this.elements.resourceEnv.value = 'Production';
      this.elements.resourceStatus.value = 'Active';
    }
    this.elements.resourceModal.classList.remove('hidden');
    this.elements.resourceName.focus();
  }

  async openEditModal(id) {
    const item = await this.db.getById(id);
    if (item) {
      this.openModal(item);
    }
  }

  closeModal() {
    this.elements.resourceModal.classList.add('hidden');
    this.elements.resourceForm.reset();
  }

  async handleSubmit(e) {
    e.preventDefault();
    const id = this.elements.resourceId.value;
    const data = {
      name: this.elements.resourceName.value,
      type: this.elements.resourceType.value,
      env: this.elements.resourceEnv.value,
      status: this.elements.resourceStatus.value,
      memory: this.elements.resourceMemory.value,
      description: this.elements.resourceDescription.value
    };

    try {
      if (id) {
        // UPDATE (U)
        await this.db.update(id, data);
        this.showToast(`Resource "${data.name}" berhasil diperbarui.`, 'success');
      } else {
        // CREATE (C)
        await this.db.create(data);
        this.showToast(`Resource baru "${data.name}" berhasil dibuat.`, 'success');
      }
      this.closeModal();
      await this.loadAndRender();
    } catch (err) {
      console.error(err);
      this.showToast(`Gagal menyimpan data: ${err.message}`, 'danger');
    }
  }

  // --- Delete Modal Actions ---
  openDeleteModal(id, name) {
    this.deleteTargetId = id;
    this.elements.deleteTargetName.textContent = `"${name}"`;
    this.elements.deleteModal.classList.remove('hidden');
  }

  closeDeleteModal() {
    this.deleteTargetId = null;
    this.elements.deleteModal.classList.add('hidden');
  }

  async handleConfirmDelete() {
    if (!this.deleteTargetId) return;
    try {
      // DELETE (D)
      await this.db.delete(this.deleteTargetId);
      this.showToast('Resource berhasil dihapus.', 'success');
      this.closeDeleteModal();
      await this.loadAndRender();
    } catch (err) {
      console.error(err);
      this.showToast(`Gagal menghapus resource: ${err.message}`, 'danger');
    }
  }

  // --- CRUD Automated Diagnostic Test (Point D Instruksi) ---
  async runDiagnostics() {
    this.elements.diagnosticsModal.classList.remove('hidden');
    this.elements.diagnosticsList.innerHTML = '<div style="padding:1rem;color:var(--text-muted)">Menjalankan siklus uji Create, Read, Update, Delete...</div>';
    this.elements.diagnosticsSummary.innerHTML = '';

    const results = [];
    const testProbeName = `probe-test-${Date.now().toString().slice(-4)}`;
    let probeId = null;

    try {
      // 1. Test CREATE
      const startTimeC = performance.now();
      const createdItem = await this.db.create({
        name: testProbeName,
        type: 'Worker',
        env: 'Development',
        status: 'Active',
        memory: '64 MB',
        description: 'Automated Diagnostic CRUD Probe Item'
      });
      const durC = (performance.now() - startTimeC).toFixed(1);
      probeId = createdItem.id;
      const passC = !!probeId && createdItem.name === testProbeName;
      results.push({
        step: '1. CREATE',
        passed: passC,
        desc: passC
          ? `Record baru berhasil disimpan dengan ID [${probeId}] dalam ${durC}ms.`
          : 'Gagal membuat record uji coba.'
      });

      // 2. Test READ
      const startTimeR = performance.now();
      const readItem = await this.db.getById(probeId);
      const durR = (performance.now() - startTimeR).toFixed(1);
      const passR = !!readItem && readItem.name === testProbeName;
      results.push({
        step: '2. READ',
        passed: passR,
        desc: passR
          ? `Data ID [${probeId}] berhasil dibaca kembali dari IndexedDB dalam ${durR}ms.`
          : 'Gagal membaca kembali data yang baru dibuat.'
      });

      // 3. Test UPDATE
      const startTimeU = performance.now();
      const updatedItem = await this.db.update(probeId, {
        status: 'Maintenance',
        description: 'Verified Update Probe Status'
      });
      const durU = (performance.now() - startTimeU).toFixed(1);
      const passU = updatedItem.status === 'Maintenance' && updatedItem.description.includes('Verified');
      results.push({
        step: '3. UPDATE',
        passed: passU,
        desc: passU
          ? `Status berhasil diperbarui menjadi "${updatedItem.status}" dalam ${durU}ms.`
          : 'Gagal memperbarui atribut data.'
      });

      // 4. Test DELETE
      const startTimeD = performance.now();
      await this.db.delete(probeId);
      const verifyDeleted = await this.db.getById(probeId);
      const durD = (performance.now() - startTimeD).toFixed(1);
      const passD = verifyDeleted === null;
      results.push({
        step: '4. DELETE',
        passed: passD,
        desc: passD
          ? `Data uji [${probeId}] berhasil dihapus bersih (getById => null) dalam ${durD}ms.`
          : 'Data uji masih tersisa setelah operasi delete.'
      });
    } catch (e) {
      results.push({
        step: 'ERROR',
        passed: false,
        desc: `Pengecualian saat pengujian: ${e.message}`
      });
    }

    // Render results
    this.elements.diagnosticsList.innerHTML = results
      .map(
        (r) => `
      <div class="diag-item ${r.passed ? 'pass' : 'fail'}">
        <div class="diag-icon">${r.passed ? '✓' : '✗'}</div>
        <div class="diag-content">
          <span class="diag-title">${r.step}: ${r.passed ? 'BERHASIL (PASS)' : 'GAGAL (FAIL)'}</span>
          <span class="diag-detail">${r.desc}</span>
        </div>
      </div>
    `
      )
      .join('');

    const allPassed = results.every((r) => r.passed);
    this.elements.diagnosticsSummary.innerHTML = `
      <span>Status Keseluruhan: <strong>${allPassed ? '100% LULUS (Semua Operasi CRUD Berfungsi Optimal)' : 'Ada Operasi Gagal'}</strong></span>
      <span>${results.filter((r) => r.passed).length}/${results.length} Pengujian Sukses</span>
    `;

    await this.loadAndRender();
    return allPassed;
  }

  closeDiagnosticsModal() {
    this.elements.diagnosticsModal.classList.add('hidden');
  }

  // --- Utility Helpers ---
  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    this.elements.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new PaaSAppController();
  app.start();
});
