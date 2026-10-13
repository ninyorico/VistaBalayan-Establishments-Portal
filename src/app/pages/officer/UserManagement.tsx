import { useState } from "react";
import { Search, Edit, Trash2, UserCog, Mail, Shield } from "lucide-react";
import { toast } from "sonner";

import { PageHero } from "../../components/vista/PolishedShell";

const users = [
  {
    id: 1,
    name: "Juan dela Cruz",
    email: "juan@balayan.gov",
    role: "Municipal Tourism Officer",
    establishment: "N/A",
    status: "Active",
    lastLogin: "2026-05-07",
  },
  {
    id: 2,
    name: "Maria Santos",
    email: "maria@beachresort.com",
    role: "Establishment Staff",
    establishment: "Balayan Beach Resort",
    status: "Active",
    lastLogin: "2026-05-07",
  },
  {
    id: 3,
    name: "Pedro Reyes",
    email: "pedro@sunsethotel.com",
    role: "Establishment Staff",
    establishment: "Sunset Hotel",
    status: "Active",
    lastLogin: "2026-05-06",
  },
  {
    id: 4,
    name: "Ana Garcia",
    email: "ana@paradiseinn.com",
    role: "Establishment Staff",
    establishment: "Paradise Inn",
    status: "Active",
    lastLogin: "2026-05-05",
  },
  {
    id: 5,
    name: "Carlos Mendoza",
    email: "carlos@restaurant.com",
    role: "Establishment Staff",
    establishment: "Seaside Restaurant",
    status: "Inactive",
    lastLogin: "2026-04-20",
  },
];

export default function UserManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = filterRole === "all" || user.role === filterRole;
    const matchesStatus = filterStatus === "all" || user.status === filterStatus;
    return matchesSearch && matchesRole && matchesStatus;
  });

  const handleAdd = () => {
    toast.success("Add user functionality");
  };

  const handleEdit = (id: number) => {
    toast.success(`Edit user ${id}`);
  };

  const handleDelete = (id: number) => {
    toast.success(`Delete user ${id}`);
  };

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Access administration"
        title="User Management"
        description="Manage system users, roles, establishment assignments, and account permissions."
        actionLabel="Add User"
        onAction={handleAdd}
        compact
      />

      {/* Filters and Search */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search
            </label>
            <div className="relative">
              <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name or email..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Role
            </label>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            >
              <option value="all">All Roles</option>
              <option value="Municipal Tourism Officer">Municipal Tourism Officer</option>
              <option value="Establishment Staff">Establishment Staff</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Status
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            >
              <option value="all">All Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <UserCog className="w-5 h-5 text-blue-600" />
            <p className="text-sm text-gray-600">Total Users</p>
          </div>
          <p className="text-3xl font-bold text-gray-900">{users.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <UserCog className="w-5 h-5 text-green-600" />
            <p className="text-sm text-gray-600">Active Users</p>
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {users.filter((u) => u.status === "Active").length}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-5 h-5 text-purple-600" />
            <p className="text-sm text-gray-600">Officers</p>
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {
              users.filter((u) => u.role === "Municipal Tourism Officer")
                .length
            }
          </p>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <UserCog className="w-5 h-5 text-orange-600" />
            <p className="text-sm text-gray-600">Staff</p>
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {users.filter((u) => u.role === "Establishment Staff").length}
          </p>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Establishment
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Last Login
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-blue-600 font-medium">
                          {user.name.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{user.name}</p>
                        <div className="flex items-center gap-1 text-gray-500 text-sm">
                          <Mail className="w-3 h-3" />
                          <span>{user.email}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-purple-600" />
                      <span className="text-sm text-gray-700">{user.role}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {user.establishment}
                  </td>
                  <td className="px-6 py-4 text-gray-600 text-sm">
                    {user.lastLogin}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                        user.status === "Active"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {user.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEdit(user.id)}
                        className="p-1 text-gray-600 hover:bg-gray-100 rounded transition"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(user.id)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
