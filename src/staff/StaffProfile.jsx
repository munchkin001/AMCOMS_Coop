import ProfileEditor from '../components/common/ProfileEditor';

const StaffProfile = ({ roleName }) => (
  <ProfileEditor profileType="staff" roleLabel={roleName} />
);

export default StaffProfile;