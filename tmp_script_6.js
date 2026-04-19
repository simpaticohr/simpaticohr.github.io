
                async function loadCompanyStorage() {
                    const list = document.getElementById('storageFilesList');
                    list.innerHTML = '<tr><td colspan="4" class="text-center py-4"><i class="fas fa-circle-notch fa-spin text-primary"></i> Loading...</td></tr>';
                    
                    const t = localStorage.getItem('simpatico_company');
                    let tenantId = 'default';
                    if (t) { try { tenantId = JSON.parse(t).id || 'default'; } catch(e){} }
                    
                    try {
                        const { data, error } = await SimpaticoDB.storage.from('hr-documents').list(tenantId, { limit: 100 });
                        if (error) throw error;
                        
                        if (!data || data.length === 0 || (data.length === 1 && data[0].name === '.emptyFolderPlaceholder')) {
                            list.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4"><i class="fas fa-folder-open mb-2 d-block fa-2x"></i> No files found for your company</td></tr>';
                            return;
                        }
                        
                        list.innerHTML = data.filter(f => f.name !== '.emptyFolderPlaceholder').map(file => {
                            const size = (file.metadata?.size / 1024 / 1024).toFixed(2);
                            const date = new Date(file.created_at).toLocaleDateString();
                            return `<tr>
                                <td><i class="fas fa-file-alt text-secondary me-2"></i><span style="word-break:break-all">${file.name}</span></td>
                                <td>${size} MB</td>
                                <td>${date}</td>
                                <td class="text-end">
                                    <button class="btn btn-sm" style="background:rgba(239,68,68,0.1);color:#ef4444;border:none;" onclick="deleteCompanyFile('${file.name}', this)"><i class="fas fa-trash"></i> Delete</button>
                                </td>
                            </tr>`;
                        }).join('');
                    } catch (e) {
                         console.error(e);
                         list.innerHTML = '<tr><td colspan="4" class="text-center text-danger py-4"><i class="fas fa-exclamation-triangle mb-2 d-block fa-2x"></i> Failed to load files</td></tr>';
                    }
                }
                
                async function deleteCompanyFile(fileName, btn) {
                    if (!confirm('Permanently delete ' + fileName + '?')) return;
                    const origHtml = btn.innerHTML;
                    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                    btn.disabled = true;
                    
                    const t = localStorage.getItem('simpatico_company');
                    let tenantId = 'default';
                    if (t) { try { tenantId = JSON.parse(t).id || 'default'; } catch(e){} }
                    
                    try {
                        const { error } = await SimpaticoDB.storage.from('hr-documents').remove([tenantId + '/' + fileName]);
                        if (error) throw error;
                        btn.closest('tr').remove();
                        if (typeof showToast === 'function') showToast('File deleted successfully', 'success');
                    } catch(e) {
                        console.error(e);
                        btn.innerHTML = origHtml;
                        btn.disabled = false;
                        if (typeof showToast === 'function') showToast('Failed to delete file', 'error');
                        else alert('Failed to delete file');
                    }
                }
            