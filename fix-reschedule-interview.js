
const originalRescheduleInterview = window.rescheduleInterview;

window.rescheduleInterview = function(buttonElement) {
  const row = buttonElement.closest('tr');
  const cells = row.cells;

  const candidateName = cells[0].querySelector('strong').innerText;
  const candidateEmail = cells[0].querySelector('small').innerText;
  const position = cells[1].innerText;
  const round = cells[2].innerText;
  const dateTime = cells[3].innerText.split('
');
  const date = dateTime[0];
  const time = dateTime[1];
  const interviewer = cells[4].innerText;
  const mode = cells[5].innerText;

  const interviewData = {
    candidateName,
    candidateEmail,
    position,
    round,
    date,
    time,
    interviewer,
    mode,
    isReschedule: true,
    originalRow: row
  };

  openModal('scheduleInterviewModal', interviewData);
};

const originalOpenModal = window.openModal;

window.openModal = function(modalId, data) {
  originalOpenModal(modalId);

  if (data && data.isReschedule) {
    document.getElementById('intCandidateName').value = data.candidateName;
    document.getElementById('intCandidateEmail').value = data.candidateEmail;
    document.getElementById('intPosition').value = data.position;
    document.getElementById('intRound').value = data.round;
    
    const dateParts = data.date.split(', ');
    const monthDay = dateParts[0];
    const year = dateParts[1];
    const dateObj = new Date(`${monthDay}, ${year}`);
    document.getElementById('intDate').value = dateObj.toISOString().split('T')[0];
    
    const timeParts = data.time.split(' ')[0].split(':');
    let hour = parseInt(timeParts[0]);
    const minute = timeParts[1];
    const ampm = data.time.split(' ')[1];
    if (ampm === 'PM' && hour < 12) {
      hour += 12;
    }
    if (ampm === 'AM' && hour === 12) {
      hour = 0;
    }
    document.getElementById('intStartTime').value = `${hour.toString().padStart(2, '0')}:${minute}`;

    document.getElementById('intInterviewer').value = Array.from(document.getElementById('intInterviewer').options).find(option => option.text.includes(data.interviewer)).value;
    document.getElementById('intMode').value = data.mode.toLowerCase().includes('video') ? 'video' : (data.mode.toLowerCase().includes('in-person') ? 'inperson' : 'phone');
    
    sessionStorage.setItem('rescheduleData', JSON.stringify({
      isReschedule: true,
      originalRowIndex: Array.from(data.originalRow.parentElement.children).indexOf(data.originalRow)
    }));
  }
};

const originalHandleScheduleInterview = window.handleScheduleInterview;

window.handleScheduleInterview = function(e) {
  const rescheduleData = JSON.parse(sessionStorage.getItem('rescheduleData'));

  if (rescheduleData && rescheduleData.isReschedule) {
    e.preventDefault();

    const candidateName = document.getElementById('intCandidateName').value.trim();
    const candidateEmail = document.getElementById('intCandidateEmail').value.trim();
    const position = document.getElementById('intPosition').value;
    const round = document.getElementById('intRound').value;
    const date = document.getElementById('intDate').value;
    const startTime = document.getElementById('intStartTime').value;
    const endTime = document.getElementById('intEndTime').value;
    const interviewer = document.getElementById('intInterviewer').value;
    const mode = document.getElementById('intMode').value;

    if (!candidateName || !candidateEmail || !position || !round || !date || !startTime || !endTime || !interviewer || !mode) {
      showToast('Please fill in all required fields!', 'error');
      return false;
    }

    if (endTime <= startTime) {
      showToast('End time must be after start time!', 'error');
      return false;
    }

    const today = new Date().toISOString().split('T')[0];
    if (date < today) {
      showToast('Cannot schedule interview in the past!', 'error');
      return false;
    }

    const dateObj = new Date(date);
    const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    const formatTime = (t) => {
      const [h, m] = t.split(':');
      const hour = parseInt(h);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour % 12 || 12;
      return `${displayHour}:${m} ${ampm}`;
    };

    const modeIcons = {
      'video': '<i class="fas fa-video me-1" style="color:var(--primary)"></i>Video',
      'inperson': '<i class="fas fa-building me-1" style="color:var(--success)"></i>In-person',
      'phone': '<i class="fas fa-phone me-1" style="color:var(--warning)"></i>Phone'
    };

    const tbody = document.getElementById('interviewTableBody');
    const originalRow = tbody.rows[rescheduleData.originalRowIndex];

    originalRow.cells[0].innerHTML = `<strong>${candidateName}</strong><br><small style="color:var(--text-secondary)">${candidateEmail}</small>`;
    originalRow.cells[1].innerText = position;
    originalRow.cells[2].innerText = round;
    originalRow.cells[3].innerHTML = `${formattedDate}<br><strong>${formatTime(startTime)}</strong>`;
    originalRow.cells[4].innerText = document.getElementById('intInterviewer').selectedOptions[0].text.split('(')[0].trim();
    originalRow.cells[5].innerHTML = modeIcons[mode] || mode;
    originalRow.cells[6].innerHTML = '<span class="status-badge scheduled">Scheduled</span>';
    
    closeModal('scheduleInterviewModal');
    document.getElementById('scheduleInterviewForm').reset();
    sessionStorage.removeItem('rescheduleData');

    showToast(`Interview for ${candidateName} has been rescheduled.`);

    return false;
  } else {
    return originalHandleScheduleInterview(e);
  }
};
