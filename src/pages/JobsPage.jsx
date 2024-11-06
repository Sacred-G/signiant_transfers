import * as React from 'react';
import { useState, useEffect } from 'react';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { 
  Table, 
  TableHeader, 
  TableRow, 
  TableHead, 
  TableBody, 
  TableCell 
} from '../components/ui/table';
import { 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  XCircle, 
  Loader2, 
  ChevronDown, 
  ChevronRight, 
  PauseCircle,
  Trash2
} from 'lucide-react';
import { useToast } from '../components/ui/use-toast';
import { getAuthHeaders } from '../lib/auth-utils';
import { deleteJob } from '../lib/signiant';

const DeleteConfirmationDialog = ({ isOpen, onClose, onConfirm, jobName }) => {
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsDeleting(true);
    await onConfirm(confirmText);
    setIsDeleting(false);
    setConfirmText('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold mb-4">Delete Job</h3>
        <p className="text-gray-600 mb-4">
          Are you sure you want to delete the job "{jobName}"? This action cannot be undone.
        </p>
        <p className="text-gray-600 mb-4">
          Type <span className="font-mono font-bold">DELETE</span> to confirm:
        </p>
        <Input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="Type DELETE to confirm"
          className="mb-4"
        />
        <div className="flex justify-end space-x-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={confirmText !== 'DELETE' || isDeleting}
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              'Delete Job'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

const JobsPage = () => {
  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const { toast } = useToast();
  
  const fetchJobs = async () => {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${import.meta.env.VITE_SIGNIANT_API_URL}/v1/jobs`, {
        headers
      });
  
      if (!response.ok) {
        throw new Error('Failed to fetch jobs');
      }
  
      const data = await response.json();
      const jobsWithDetails = await Promise.all(data.items.map(async (job) => {
        let transferRate = null;
        
        // Get monitor status
        const monitorStatus = job.triggers?.[0]?.monitor?.status?.state;
        const jobStatus = monitorStatus || job.actions?.[0]?.status?.state || 'READY';
  
        if (jobStatus === 'IN_PROGRESS') {
          try {
            const transferResponse = await fetch(
              `${import.meta.env.VITE_SIGNIANT_API_URL}/v1/transfers/${job.jobId}`,
              { headers }
            );
            if (transferResponse.ok) {
              const transferData = await transferResponse.json();
              transferRate = transferData.items[0]?.currentRateBitsPerSecond;
            }
          } catch (error) {
            console.error('Error fetching transfer details:', error);
          }
        }
  
        // Clean up the job name
        const jobName = job.name || 'Unnamed Job';
        // Remove 'Hot Folder - ' prefix and timestamp suffix if present
        const cleanName = jobName
          .replace('Hot Folder - ', '')
          .replace(/\s+-\s+\d{8}_\d{6}$/, ''); // Removes timestamp pattern at the end
  
        console.log('Processing job:', {
          originalName: job.name,
          cleanName: cleanName,
          jobId: job.jobId
        });
  
        return {
          ...job,
          jobId: job.jobId,
          name: cleanName,
          status: jobStatus,
          lastModifiedOn: job.lastModifiedOn || job.modifiedOn || job.createdOn,
          currentRateBitsPerSecond: transferRate,
          activeAlerts: job.activeAlerts || [],
          actions: job.actions || [],
          createdByAuthId: job.createdByAuthId,
          lastModifiedByAuthId: job.lastModifiedByAuthId,
          createdOn: job.createdOn
        };
      }));
  
      setJobs(jobsWithDetails);
    } catch (error) {
      console.error('Error fetching jobs:', error);
      setError(error.message);
      toast({
        title: "Error",
        description: "Failed to load jobs",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, [toast]);

  const handleDeleteClick = (e, job) => {
    e.stopPropagation();
    setSelectedJob(job);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async (confirmText) => {
    try {
      await deleteJob(selectedJob.jobId, confirmText);
      toast({
        title: "Success",
        description: "Job deleted successfully",
      });
      fetchJobs();
    } catch (error) {
      console.error('Error deleting job:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete job",
        variant: "destructive",
      });
      throw error; // Re-throw to handle in the dialog
    }
  };

  const getJobStats = () => {
    // Add debug logging to see what statuses we have
    console.log('Jobs for stats calculation:', jobs.map(job => ({
      jobId: job.jobId,
      status: job.status,
    })));
  
    const total = jobs.length;
    const completed = jobs.filter(job => 
      job.status?.toUpperCase() === 'OK' || 
      job.status?.toUpperCase() === 'COMPLETED'
    ).length;
    const inProgress = jobs.filter(job => 
      job.status?.toUpperCase() === 'IN_PROGRESS'
    ).length;
    const failed = jobs.filter(job => 
      job.status?.toUpperCase() === 'ERROR' ||
      (job.activeAlerts && job.activeAlerts.length > 0)
    ).length;
    const paused = jobs.filter(job => 
      job.status?.toUpperCase() === 'PAUSED'
    ).length;
    const ready = jobs.filter(job => 
      job.status?.toUpperCase() === 'READY' || 
      !job.status || 
      job.status === 'N/A'
    ).length;
    const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  
    // Debug log the calculated stats
    console.log('Calculated stats:', {
      total,
      completed,
      inProgress,
      failed,
      ready,
      paused,
      successRate
    });
  
    return { total, completed, inProgress, failed, ready, paused, successRate };
  
  };

  const toggleRowExpansion = (jobId) => {
    const newExpandedRows = new Set(expandedRows);
    if (expandedRows.has(jobId)) {
      newExpandedRows.delete(jobId);
    } else {
      newExpandedRows.add(jobId);
    }
    setExpandedRows(newExpandedRows);
  };

  const getStatusVariant = (status, alerts = []) => {
    const hasCriticalAlert = alerts.some(alert => 
      ['SOURCE_ENDPOINT_OFFLINE', 'DESTINATION_ENDPOINT_OFFLINE', 'IN_PROGRESS_TRANSFER_HAS_ERRORS']
      .includes(alert.type)
    );
  
    if (hasCriticalAlert) return 'destructive';
  
    switch (status?.toUpperCase()) {
      case 'OK':
        return 'success';
      case 'IN_PROGRESS':
        return 'default';
      case 'ERROR':
        return 'destructive';
      case 'PAUSED':
        return 'warning';
      case 'READY':
        return 'secondary';
      default:
        return 'secondary';
    }
  };
  
  const getStatusDisplay = (status) => {
    switch (status?.toUpperCase()) {
      case 'OK':
        return 'Completed';
      case 'IN_PROGRESS':
        return 'In Progress';
      case 'ERROR':
        return 'Error';
      case 'PAUSED':
        return 'Paused';
      case 'READY':
        return 'Ready';
      default:
        return status || 'Ready';
    }
  
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'N/A';
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const StatCard = ({ title, value, subtitle, icon: Icon, bgColor, textColor }) => (
    <Card className={`bg-white shadow-md`}>
      <div className="p-6">
        <div className="flex justify-between items-start">
          <div>
            <p className={`text-sm ${textColor} font-medium`}>{title}</p>
            <h2 className="text-3xl font-bold text-gray-900">{value}</h2>
            <p className={`text-sm ${textColor}`}>{subtitle}</p>
          </div>
          <div className={`p-2 ${bgColor} rounded-full`}>
            <Icon className={textColor} />
          </div>
        </div>
      </div>
    </Card>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 max-w-7xl mx-auto bg-gray-50">
        <div className="text-center text-red-500 bg-white rounded-lg shadow-lg p-8">
          <h2 className="text-xl font-semibold">Error loading jobs</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  const stats = getJobStats();

  return (
    <div className="p-6 max-w-7xl mx-auto bg-gray-50">
      <DeleteConfirmationDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        jobName={selectedJob?.jobName || 'Unnamed Job'}
      />

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <StatCard
          title="Total Jobs"
          value={stats.total}
          subtitle={`${stats.completed} completed`}
          icon={Clock}
          bgColor="bg-blue-100"
          textColor="text-blue-600"
        />
        <StatCard
          title="Completed"
          value={stats.completed}
          subtitle={`${stats.successRate}% success rate`}
          icon={CheckCircle}
          bgColor="bg-green-100"
          textColor="text-green-600"
        />
        <StatCard
          title="In Progress"
          value={stats.inProgress}
          subtitle="Active transfers"
          icon={Clock}
          bgColor="bg-purple-100"
          textColor="text-purple-600"
        />
        <StatCard
          title="Paused"
          value={stats.paused}
          icon={PauseCircle}
          bgColor="bg-yellow-100"
          textColor="text-yellow-700"
        />
        <StatCard
          title="Failed"
          value={stats.failed}
          subtitle="Require attention"
          icon={XCircle}
          bgColor="bg-red-100"
          textColor="text-red-600"
        />
      </div>

      {stats.failed > 0 && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded-r-lg shadow-sm">
          <div className="flex items-center">
            <AlertCircle className="text-red-500 mr-2" />
            <p className="text-red-700 font-medium">
              {stats.failed} job(s) failed and require attention
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <Table>

          <TableHeader>
  <TableRow className="bg-gray-50 hover:bg-gray-50">
    <TableHead className="w-8"></TableHead>
    <TableHead className="font-semibold">NAME</TableHead>
    <TableHead className="font-semibold">STATUS</TableHead>
    <TableHead className="font-semibold">TRANSFER RATE</TableHead>
    <TableHead className="font-semibold">LAST ACTIVITY</TableHead>
    <TableHead className="font-semibold">ACTIONS</TableHead>
  </TableRow>
</TableHeader>

{/* Table Body */}
<TableBody>
  {jobs.map(job => {
    const isExpanded = expandedRows.has(job.jobId);
    const destination = job.actions?.[0]?.data?.destination;

    return (
      <React.Fragment key={job.jobId}>
        <TableRow 
          className={`transition-colors ${
            isExpanded ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-gray-50'
          }`}
        >
          <TableCell className="w-8 cursor-pointer" onClick={() => toggleRowExpansion(job.jobId)}>
            {isExpanded ? 
              <ChevronDown className="h-4 w-4 text-blue-500" /> : 
              <ChevronRight className="h-4 w-4 text-gray-400" />
            }
          </TableCell>
          <TableCell className="font-medium cursor-pointer" onClick={() => toggleRowExpansion(job.jobId)}>
            {job.name}
          </TableCell>
          <TableCell className="cursor-pointer" onClick={() => toggleRowExpansion(job.jobId)}>
            <Badge variant={getStatusVariant(job.status, job.activeAlerts)}>
              {getStatusDisplay(job.status)}
            </Badge>
          </TableCell>
          <TableCell className="text-gray-600 cursor-pointer" onClick={() => toggleRowExpansion(job.jobId)}>
            {job.currentRateBitsPerSecond 
              ? `${Math.round(job.currentRateBitsPerSecond / 1024 / 1024)} Mbps` 
              : 'N/A'}
          </TableCell>
          <TableCell className="text-gray-600 cursor-pointer" onClick={() => toggleRowExpansion(job.jobId)}>
            {formatDate(job.lastModifiedOn)}
          </TableCell>
          <TableCell>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-100"
              onClick={(e) => handleDeleteClick(e, job)}
              disabled={job.status === 'IN_PROGRESS'}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </TableCell>
        </TableRow>
        {isExpanded && destination && (
          <TableRow className="bg-blue-50">
            <TableCell colSpan={6}>
              <div className="p-4 bg-gradient-to-r from-blue-50 to-white rounded-lg m-2 shadow-sm">
                <h3 className="font-semibold text-blue-700 mb-4">Transfer Details</h3>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-medium text-blue-600">Source Details</p>
                      <div className="space-y-2">
                        <p className="text-sm text-gray-700">Name: {job.actions?.[0]?.data?.source?.name || 'N/A'}</p>
                        <p className="text-sm text-gray-700">Created By: {job.actions?.[0]?.data?.source?.createdBy || 'N/A'}</p>
                        <p className="text-sm text-gray-700">Last Modified By: {job.actions?.[0]?.data?.source?.lastModifiedBy || 'N/A'}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <p className="text-sm font-medium text-blue-600">Destination Details</p>
                      <div className="space-y-2">
                        <p className="text-sm text-gray-700">Name: {destination.name || 'N/A'}</p>
                        <p className="text-sm text-gray-700">Created By: {destination.createdBy || 'N/A'}</p>
                        <p className="text-sm text-gray-700">Last Modified By: {destination.lastModifiedBy || 'N/A'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Job Information section with Job ID */}
                  <div className="col-span-2 mt-4">
                    <p className="text-sm font-medium text-blue-600">Job Information</p>
                    <div className="grid grid-cols-2 gap-4 mt-2">
                      <div>
                        <p className="text-sm text-gray-700">Job ID: {job.jobId}</p>
                        <p className="text-sm text-gray-700">Created By: {job.createdByAuthId || 'N/A'}</p>
                        <p className="text-sm text-gray-700">Created On: {formatDate(job.createdOn)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-700">Last Modified By: {job.lastModifiedByAuthId || 'N/A'}</p>
                        <p className="text-sm text-gray-700">Last Modified On: {formatDate(job.lastModifiedOn)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="col-span-2">
                    <p className="text-sm font-medium text-blue-600">Path</p>
                    <p className="text-sm text-gray-700 break-all bg-white p-2 rounded border border-blue-100">
                      {destination.config?.path || 'N/A'}
                    </p>
                  </div>
                </div>
              </div>
            </TableCell>
          </TableRow>
)}
                  
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default JobsPage;
