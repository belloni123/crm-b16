'use client';

import React, { useState } from 'react';
import { 
  createProject, 
  updateProject, 
  deleteProject 
} from '@/app/actions/projects';
import { 
  createUser, 
  updateUser, 
  deleteUser, 
  addProjectMembership, 
  removeProjectMembership 
} from '@/app/actions/users';
import { 
  Folder, 
  Users, 
  Plus, 
  Edit2, 
  Trash2, 
  UserPlus, 
  Link2, 
  Unlink, 
  ShieldAlert,
  Loader2,
  FolderOpen,
  ArrowRight
} from 'lucide-react';
import Link from 'next/link';

interface UserMembership {
  id: string;
  role: string;
  project: {
    id: string;
    name: string;
  };
}

interface User {
  id: string;
  name: string | null;
  email: string;
  role: string;
  createdAt: Date;
  memberships: UserMembership[];
}

interface ProjectMembership {
  id: string;
  role: string;
  user: {
    id: string;
    name: string | null;
    email: string;
  };
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  memberships: ProjectMembership[];
}

interface AdminPanelProps {
  initialUsers: User[];
  initialProjects: Project[];
}

export function AdminPanel({ initialUsers, initialProjects }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<'projects' | 'users'>('projects');
  
  // Lista local para refletir mudanças sem recarregar a página inteira
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modais de Criação / Edição
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projName, setProjName] = useState('');
  const [projDesc, setProjDesc] = useState('');

  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPass, setUserPass] = useState('');
  const [userRole, setUserRole] = useState('USER'); // SUPERADMIN ou USER

  // Estado de Vincular Projeto
  const [linkingUserId, setLinkingUserId] = useState<string | null>(null);
  const [linkProjId, setLinkProjId] = useState('');
  const [linkRole, setLinkRole] = useState<'PROJECT_ADMIN' | 'MEMBER'>('MEMBER');

  const showMsg = (text: string, type: 'success' | 'error' = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  // ==========================================
  // AÇÕES DE PROJETO
  // ==========================================
  
  const handleOpenCreateProject = () => {
    setEditingProject(null);
    setProjName('');
    setProjDesc('');
    setShowProjectModal(true);
  };

  const handleOpenEditProject = (p: Project) => {
    setEditingProject(p);
    setProjName(p.name);
    setProjDesc(p.description || '');
    setShowProjectModal(true);
  };

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPending(true);
    try {
      if (editingProject) {
        const updated = await updateProject(editingProject.id, { name: projName, description: projDesc });
        setProjects(projects.map(p => p.id === editingProject.id ? { ...p, name: updated.name, description: updated.description } : p));
        showMsg('Projeto atualizado com sucesso.');
      } else {
        const created = await createProject({ name: projName, description: projDesc });
        // Adiciona à lista local (com memberships vazios)
        setProjects([{ ...created, memberships: [] }, ...projects]);
        showMsg('Projeto criado com sucesso. Funil padrão e tags inicializados.');
      }
      setShowProjectModal(false);
    } catch (err: any) {
      showMsg(err.message || 'Erro ao salvar projeto.', 'error');
    } finally {
      setIsPending(false);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (!confirm('Deseja realmente excluir este projeto? Leads, tarefas e chats vinculados serão perdidos permanentemente.')) return;
    setIsPending(true);
    try {
      await deleteProject(id);
      setProjects(projects.filter(p => p.id !== id));
      showMsg('Projeto excluído com sucesso.');
    } catch (err: any) {
      showMsg(err.message || 'Erro ao excluir projeto.', 'error');
    } finally {
      setIsPending(false);
    }
  };

  // ==========================================
  // AÇÕES DE USUÁRIO
  // ==========================================

  const handleOpenCreateUser = () => {
    setEditingUser(null);
    setUserName('');
    setUserEmail('');
    setUserPass('');
    setUserRole('USER');
    setShowUserModal(true);
  };

  const handleOpenEditUser = (u: User) => {
    setEditingUser(u);
    setUserName(u.name || '');
    setUserEmail(u.email);
    setUserPass('');
    setUserRole(u.role);
    setShowUserModal(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPending(true);
    try {
      if (editingUser) {
        const updated = await updateUser(editingUser.id, {
          name: userName,
          email: userEmail,
          passwordRaw: userPass || undefined,
          role: userRole,
        });
        setUsers(users.map(u => u.id === editingUser.id ? { ...u, name: updated.name, email: updated.email, role: updated.role } : u));
        showMsg('Usuário atualizado com sucesso.');
      } else {
        if (!userPass) {
          throw new Error('Senha é obrigatória para novos usuários.');
        }
        const created = await createUser({
          name: userName,
          email: userEmail,
          passwordRaw: userPass,
          role: userRole,
        });
        setUsers([{ ...created, createdAt: new Date(), memberships: [] }, ...users]);
        showMsg('Usuário cadastrado com sucesso.');
      }
      setShowUserModal(false);
    } catch (err: any) {
      showMsg(err.message || 'Erro ao salvar usuário.', 'error');
    } finally {
      setIsPending(false);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm('Deseja realmente remover este usuário do sistema comercial?')) return;
    setIsPending(true);
    try {
      await deleteUser(id);
      setUsers(users.filter(u => u.id !== id));
      showMsg('Usuário removido com sucesso.');
    } catch (err: any) {
      showMsg(err.message || 'Erro ao excluir usuário.', 'error');
    } finally {
      setIsPending(false);
    }
  };

  // ==========================================
  // PERMISSÕES / VINCULAÇÃO (MEMBERSHIPS)
  // ==========================================

  const handleAddMembership = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkingUserId || !linkProjId) return;
    setIsPending(true);
    try {
      const added = await addProjectMembership({
        userId: linkingUserId,
        projectId: linkProjId,
        role: linkRole
      });

      const projectObj = projects.find(p => p.id === linkProjId);
      if (!projectObj) return;

      // Atualiza o estado local do usuário
      setUsers(users.map(u => {
        if (u.id === linkingUserId) {
          const newMembership: UserMembership = {
            id: added.id,
            role: added.role,
            project: { id: projectObj.id, name: projectObj.name }
          };
          // Evita duplicados no estado
          const filtered = u.memberships.filter(m => m.project.id !== linkProjId);
          return { ...u, memberships: [...filtered, newMembership] };
        }
        return u;
      }));

      showMsg('Permissão de acesso adicionada com sucesso.');
      setLinkProjId('');
    } catch (err: any) {
      showMsg(err.message || 'Erro ao conceder acesso.', 'error');
    } finally {
      setIsPending(false);
    }
  };

  const handleRemoveMembership = async (userId: string, projectId: string) => {
    if (!confirm('Remover o acesso deste usuário ao projeto?')) return;
    setIsPending(true);
    try {
      await removeProjectMembership(userId, projectId);
      
      setUsers(users.map(u => {
        if (u.id === userId) {
          return { ...u, memberships: u.memberships.filter(m => m.project.id !== projectId) };
        }
        return u;
      }));
      showMsg('Acesso removido com sucesso.');
    } catch (err: any) {
      showMsg(err.message || 'Erro ao remover acesso.', 'error');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="flex-1 min-h-screen bg-[linear-gradient(to_bottom,rgba(5,5,5,0.8),rgba(10,20,13,0.9))] p-6 md:p-10">
      
      {/* Header do Painel */}
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 border-b border-border-subtle pb-6">
        <div>
          <div className="flex items-center gap-3">
            <ShieldAlert className="h-6 w-6 text-accent" />
            <h1 className="text-3xl font-extrabold font-display text-white tracking-tight">
              PAINEL SUPERADMIN
            </h1>
          </div>
          <p className="text-sm text-text-secondary mt-1">
            Controle global do CRM: crie projetos (clientes), gerencie usuários e distribua acessos.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/project"
            className="px-4 py-2 text-xs font-semibold text-text-secondary hover:text-white bg-glass-2 border border-border-subtle hover:border-text-secondary rounded-lg transition-all"
          >
            Ir para Projetos
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto">
        
        {/* Mensagens de Feedback */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg border text-sm font-semibold flex items-center justify-between ${
            message.type === 'success' 
              ? 'bg-accent/10 border-accent/30 text-accent-light' 
              : 'bg-danger/10 border-danger/20 text-danger'
          }`}>
            <span>{message.text}</span>
            <button onClick={() => setMessage(null)} className="text-xs hover:underline cursor-pointer">Fechar</button>
          </div>
        )}

        {/* Abas e botão Criar */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex bg-glass-1 border border-border-subtle p-1 rounded-lg">
            <button
              onClick={() => { setActiveTab('projects'); setLinkingUserId(null); }}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer ${
                activeTab === 'projects' 
                  ? 'bg-accent text-black shadow-md' 
                  : 'text-text-secondary hover:text-white'
              }`}
            >
              <Folder className="h-3.5 w-3.5" />
              Projetos ({projects.length})
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer ${
                activeTab === 'users' 
                  ? 'bg-accent text-black shadow-md' 
                  : 'text-text-secondary hover:text-white'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              Usuários ({users.length})
            </button>
          </div>

          {activeTab === 'projects' ? (
            <button
              onClick={handleOpenCreateProject}
              className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-light text-black font-bold text-xs rounded-lg transition-all shadow-[0_0_10px_rgba(159,232,112,0.15)] cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Criar Projeto
            </button>
          ) : (
            <button
              onClick={handleOpenCreateUser}
              className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-light text-black font-bold text-xs rounded-lg transition-all shadow-[0_0_10px_rgba(159,232,112,0.15)] cursor-pointer"
            >
              <UserPlus className="h-4 w-4" />
              Cadastrar Usuário
            </button>
          )}
        </div>

        {/* TAB 1: PROJETOS */}
        {activeTab === 'projects' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {projects.length === 0 ? (
              <div className="col-span-2 text-center py-12 bg-transparent border border-dashed border-border-subtle rounded-2xl">
                <FolderOpen className="h-10 w-10 text-text-tertiary mx-auto mb-3" />
                <p className="text-sm text-text-secondary">Nenhum projeto cadastrado.</p>
              </div>
            ) : (
              projects.map((proj) => (
                <div 
                  key={proj.id}
                  className="bg-glass-1 border border-border-subtle hover:border-border-strong rounded-2xl p-6 shadow-xl relative overflow-hidden flex flex-col justify-between"
                >
                  <div className="mb-4">
                    <div className="flex items-start justify-between gap-4">
                      <h3 className="text-lg font-bold font-display text-white truncate">
                        {proj.name}
                      </h3>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => handleOpenEditProject(proj)}
                          className="p-1.5 text-text-secondary hover:text-white bg-glass-3 border border-border-subtle rounded-md cursor-pointer"
                          title="Editar"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteProject(proj.id)}
                          className="p-1.5 text-danger/80 hover:text-danger bg-glass-3 border border-border-subtle rounded-md cursor-pointer"
                          title="Excluir"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-text-secondary mt-1.5 min-h-[32px] line-clamp-2 leading-relaxed">
                      {proj.description || 'Sem descrição cadastrada.'}
                    </p>
                  </div>

                  <div className="border-t border-border-subtle pt-4 flex items-center justify-between gap-4">
                    <span className="text-[10px] text-text-tertiary">
                      Criado em {new Date(proj.createdAt).toLocaleDateString('pt-BR')}
                    </span>
                    <Link
                      href={`/project/${proj.id}`}
                      className="flex items-center gap-1.5 text-xs text-accent hover:text-accent-light font-bold"
                    >
                      Acessar CRM
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 2: USUÁRIOS */}
        {activeTab === 'users' && (
          <div className="flex flex-col gap-6">
            {users.length === 0 ? (
              <div className="text-center py-12 bg-transparent border border-dashed border-border-subtle rounded-2xl">
                <Users className="h-10 w-10 text-text-tertiary mx-auto mb-3" />
                <p className="text-sm text-text-secondary">Nenhum usuário cadastrado.</p>
              </div>
            ) : (
              <div className="bg-glass-1 border border-border-subtle rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-border-subtle bg-glass-1 text-text-secondary text-xs uppercase tracking-wider">
                        <th className="p-4 font-semibold">Nome / Email</th>
                        <th className="p-4 font-semibold">Permissão Global</th>
                        <th className="p-4 font-semibold">Projetos Vinculados</th>
                        <th className="p-4 font-semibold text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[rgba(255,255,255,0.04)] text-sm">
                      {users.map((u) => (
                        <tr key={u.id} className="hover:bg-glass-1">
                          <td className="p-4">
                            <div className="font-bold text-white">{u.name || 'Membro'}</div>
                            <div className="text-xs text-text-secondary">{u.email}</div>
                          </td>
                          <td className="p-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              u.role === 'SUPERADMIN' 
                                ? 'bg-danger/10 text-danger border border-danger/20' 
                                : 'bg-glass-3 text-text-secondary border border-border-subtle'
                            }`}>
                              {u.role}
                            </span>
                          </td>
                          <td className="p-4">
                            <div className="flex flex-wrap gap-2 items-center">
                              {/* Lista de projetos aos quais está vinculado */}
                              {u.memberships.map((m) => (
                                <span 
                                  key={m.id}
                                  className="inline-flex items-center gap-1 bg-accent/5 border border-border-glass rounded-full px-2.5 py-0.5 text-xs text-accent-light"
                                >
                                  <span>{m.project.name} ({m.role === 'PROJECT_ADMIN' ? 'Admin' : 'Membro'})</span>
                                  <button
                                    onClick={() => handleRemoveMembership(u.id, m.project.id)}
                                    className="text-danger hover:text-red-400 p-0.5 rounded-full hover:bg-red-500/10 cursor-pointer"
                                    title="Remover Acesso"
                                  >
                                    <Unlink className="h-3 w-3" />
                                  </button>
                                </span>
                              ))}

                              {/* Botão para abrir o form de vinculação */}
                              {linkingUserId !== u.id ? (
                                <button
                                  onClick={() => { setLinkingUserId(u.id); setLinkProjId(''); }}
                                  className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-white bg-glass-3 hover:bg-[rgba(255,255,255,0.06)] border border-border-subtle rounded-full px-2 py-0.5 cursor-pointer font-semibold"
                                >
                                  <Plus className="h-3 w-3" />
                                  Vincular Projeto
                                </button>
                              ) : (
                                <form onSubmit={handleAddMembership} className="flex items-center gap-2 bg-[#0d140e] border border-border-glass rounded-lg p-1.5">
                                  <select
                                    required
                                    value={linkProjId}
                                    onChange={(e) => setLinkProjId(e.target.value)}
                                    className="bg-bg-base border border-border-subtle rounded px-2 py-1 text-xs text-white outline-none"
                                  >
                                    <option value="">Selecione...</option>
                                    {projects
                                      .filter(p => !u.memberships.some(m => m.project.id === p.id))
                                      .map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                      ))
                                    }
                                  </select>
                                  <select
                                    value={linkRole}
                                    onChange={(e) => setLinkRole(e.target.value as any)}
                                    className="bg-bg-base border border-border-subtle rounded px-2 py-1 text-xs text-white outline-none"
                                  >
                                    <option value="MEMBER">Membro</option>
                                    <option value="PROJECT_ADMIN">Admin</option>
                                  </select>
                                  <button
                                    type="submit"
                                    className="px-2 py-1 bg-accent text-black rounded text-xs font-bold cursor-pointer"
                                  >
                                    Salvar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setLinkingUserId(null)}
                                    className="px-2 py-1 text-text-secondary hover:text-white text-xs cursor-pointer"
                                  >
                                    Cancelar
                                  </button>
                                </form>
                              )}
                            </div>
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleOpenEditUser(u)}
                                className="p-1.5 text-text-secondary hover:text-white bg-glass-2 border border-border-subtle rounded-md cursor-pointer"
                                title="Editar Usuário"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteUser(u.id)}
                                className="p-1.5 text-danger/80 hover:text-danger bg-glass-2 border border-border-subtle rounded-md cursor-pointer"
                                title="Excluir Usuário"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* ==========================================
      MODAL PROJETO
      ========================================== */}
      {showProjectModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-bg-elevated border border-border-strong w-full max-w-md rounded-2xl overflow-hidden shadow-2xl p-6">
            <h2 className="text-xl font-bold font-display text-white mb-4">
              {editingProject ? 'Editar Projeto' : 'Criar Novo Projeto'}
            </h2>
            <form onSubmit={handleSaveProject} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-text-secondary uppercase">Nome do Projeto (Cliente)</label>
                <input
                  required
                  type="text"
                  placeholder="Ex: No Front Scale Club"
                  value={projName}
                  onChange={(e) => setProjName(e.target.value)}
                  className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-accent"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-text-secondary uppercase">Descrição</label>
                <textarea
                  placeholder="Descreva o escopo, objetivos ou contatos chave."
                  value={projDesc}
                  onChange={(e) => setProjDesc(e.target.value)}
                  rows={3}
                  className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-accent resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowProjectModal(false)}
                  className="px-4 py-2 text-xs font-bold text-text-secondary hover:text-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 bg-accent hover:bg-accent-light text-black font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
                >
                  {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                  {editingProject ? 'Salvar Alterações' : 'Criar Projeto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================
      MODAL USUÁRIO
      ========================================== */}
      {showUserModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-bg-elevated border border-border-strong w-full max-w-md rounded-2xl overflow-hidden shadow-2xl p-6">
            <h2 className="text-xl font-bold font-display text-white mb-4">
              {editingUser ? 'Editar Usuário' : 'Cadastrar Novo Usuário'}
            </h2>
            <form onSubmit={handleSaveUser} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-text-secondary uppercase">Nome Completo</label>
                <input
                  required
                  type="text"
                  placeholder="Ex: João da Silva"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-accent"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-text-secondary uppercase">E-mail</label>
                <input
                  required
                  type="email"
                  placeholder="joao@nofrontscale.com.br"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-accent"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-text-secondary uppercase">
                  {editingUser ? 'Alterar Senha (deixe em branco para manter)' : 'Senha de Acesso'}
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  required={!editingUser}
                  value={userPass}
                  onChange={(e) => setUserPass(e.target.value)}
                  className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-accent"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-text-secondary uppercase">Função Global</label>
                <select
                  value={userRole}
                  onChange={(e) => setUserRole(e.target.value)}
                  className="bg-bg-base border border-border-subtle rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-accent"
                >
                  <option value="USER">Usuário Comercial Comum</option>
                  <option value="SUPERADMIN">Superadmin (Acesso Global)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="px-4 py-2 text-xs font-bold text-text-secondary hover:text-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 bg-accent hover:bg-accent-light text-black font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1.5"
                >
                  {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                  {editingUser ? 'Salvar Alterações' : 'Cadastrar Usuário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
