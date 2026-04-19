
                function initCareersSettings() {
                    const compData = JSON.parse(localStorage.getItem('simpatico_company') || '{}');
                    const companyId = compData.id || 'YOUR_COMPANY_ID';
                    
                    const atsUrl = window.location.origin + window.location.pathname.replace('/dashboard/hr.html', '');
                    const widgetCode = '<div id="simpatico-careers-widget" data-company-id="' + companyId + '" data-ats-url="' + atsUrl + '"></div>\n<scr' + 'ipt src="' + atsUrl + '/widget/simpatico-careers.js"></scr' + 'ipt>';
                    
                    document.getElementById('widgetEmbedCode').value = widgetCode;
                    document.getElementById('previewWidgetLink').href = atsUrl + '/src/evalis-jobs.html?company_id=' + companyId;
                    
                    const isEnabled = localStorage.getItem('simpatico_careers_enabled') === 'true';
                    document.getElementById('enableCareersWidget').checked = isEnabled;
                    document.getElementById('widgetCodeContainer').style.display = isEnabled ? 'block' : 'none';
                    
                    document.getElementById('syndicateLinkedIn').checked = localStorage.getItem('simpatico_syn_linkedin') === 'true';
                    document.getElementById('syndicateIndeed').checked = localStorage.getItem('simpatico_syn_indeed') === 'true';
                }

                function toggleCareersWidget() {
                    const isEnabled = document.getElementById('enableCareersWidget').checked;
                    localStorage.setItem('simpatico_careers_enabled', isEnabled);
                    document.getElementById('widgetCodeContainer').style.display = isEnabled ? 'block' : 'none';
                    if (typeof showToast === 'function') {
                        showToast(isEnabled ? 'Careers Widget Enabled' : 'Careers Widget Disabled');
                    }
                }

                function saveSyndicationSettings() {
                    localStorage.setItem('simpatico_syn_linkedin', document.getElementById('syndicateLinkedIn').checked);
                    localStorage.setItem('simpatico_syn_indeed', document.getElementById('syndicateIndeed').checked);
                    if (typeof showToast === 'function') {
                        showToast('Syndication settings saved');
                    }
                }

                function copyWidgetCode() {
                    const code = document.getElementById('widgetEmbedCode');
                    code.select();
                    document.execCommand('copy');
                    if (typeof showToast === 'function') {
                        showToast('Widget code copied to clipboard!');
                    } else {
                        alert('Code copied!');
                    }
                }
                
                // Hook into navigation or run once
                document.addEventListener('DOMContentLoaded', () => {
                    initCareersSettings();
                });
                
                // Add hook to the global navigateTo if we want it updated exactly on tab switch
                const originalNav = window.navigateTo;
                if (typeof originalNav === 'function') {
                    window.navigateTo = function(sectionId, navEl) {
                        originalNav(sectionId, navEl);
                        if (sectionId === 'settings') {
                            initCareersSettings();
                        }
                    };
                }
            